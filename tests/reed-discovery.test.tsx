import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ACTIVATE, RELEASE, REED_INITIAL, mapReedPointer, moveReed, orientReed, reedContact, reedContours, reedZone } from "@/lib/leadmagnet/reed-discovery";
import { MagnetPlay } from "@/components/leadmagnet/magnet-play";
import { LANGUAGES, setLocale, t } from "@/lib/i18n/core";
import { readFileSync } from "node:fs";

beforeEach(async () => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    try { await GlobalRegistrator.unregister(); } catch {}
    GlobalRegistrator.register({ url: "http://localhost/" });
  }
  setLocale("fr");
});
afterEach(() => { cleanup(); setLocale("fr"); });

describe("Reed teaching model — independent history oracle", () => {
  // Dipole level-set/analytic-null assertions intentionally retired: user-approved
  // schematic PIC silhouettes replace physics. Keep independent geometry/history tests.
  for (const orientation of ["parallel", "perpendicular"] as const) {
    test(`${orientation}: exact drawn polygons agree with ON/HOLD/OFF at every edge`, () => {
      const inner=reedContours(orientation,ACTIVATE), outer=reedContours(orientation,RELEASE);
      expect(inner).toHaveLength(4); expect(outer).toHaveLength(4);
      const inPolygon=(points: {x:number;y:number}[], q:{x:number;y:number}) => {
        let yes=false;
        for(let i=0,j=points.length-1;i<points.length;j=i++) {
          const a=points[i],b=points[j]; if(!a || !b) continue;
          if((a.y>q.y)!==(b.y>q.y) && q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x) yes=!yes;
        }
        return yes;
      };
      for(let x=1.37;x<440;x+=4) for(let y=1.61;y<280;y+=4) {
        const q={x,y};
        const expected=inner.some(c=>inPolygon(c.points,q)) ? "ON" : outer.some(c=>inPolygon(c.points,q)) ? "HOLD" : "OFF";
        expect(reedZone(q,orientation)).toBe(expected);
      }
      for(const c of inner) for(const q of c.points) expect(reedZone(q,orientation)).toBe("ON");
      expect(ACTIVATE).toBeGreaterThan(RELEASE);
    });
  }
  test("perpendicular: regular flat OFF cross releases closed contact near and far", () => {
    // Horizontal corridor narrows locally to +/-14 so quadrant roots reach
    // beneath y122/158; its legitimate +/-13 interior remains entirely OFF.
    for(let d=-120;d<=120;d+=4) for(const q of [{x:220+d,y:140},{x:220,y:140+d},{x:229,y:140+d},{x:211,y:140+d},{x:220+d,y:153},{x:220+d,y:127}]) {
      expect(reedZone(q,"perpendicular")).toBe("OFF");
      expect(reedContact(true,q,"perpendicular")).toBe(false);
    }
    for(const x of [-60,60])for(const y of [-60,60]) expect(reedZone({x:220+x,y:140+y},"perpendicular")).toBe("ON");
  });
  test("parallel: main vertical lobes, smaller side drops and real near-sensor gaps", () => {
    const shapes=reedContours("parallel",RELEASE);
    const area=(points:{x:number;y:number}[])=>Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+(b ? a.x*b.y-b.x*a.y : 0)},0))/2;
    expect(area(shapes[0]?.points ?? [])).toBeGreaterThan(area(shapes[2]?.points ?? [])*1.25);
    expect(reedZone({x:220,y:70},"parallel")).toBe("ON");
    expect(reedZone({x:220,y:210},"parallel")).toBe("ON");
    for(const q of [{x:220,y:140},{x:260,y:118},{x:180,y:162}]) expect(reedContact(true,q,"parallel")).toBe(false);
  });
  test("parallel mains are elongated, smoothly tapered and rooted beneath the housing", () => {
    for (const threshold of [ACTIVATE, RELEASE]) {
      const mains=reedContours("parallel",threshold).slice(0,2);
      for (const [index,contour] of mains.entries()) {
        const xs=contour.points.map(q=>q.x), ys=contour.points.map(q=>Math.abs(q.y-140));
        const width=Math.max(...xs)-Math.min(...xs), height=Math.max(...ys)-Math.min(...ys);
        expect(height).toBeGreaterThan(width);
        expect(Math.min(...ys)).toBeLessThan(8);
        expect(reedZone({x:220,y:140+(index===0 ? -17 : 17)},"parallel")).toBe("ON");
        if(threshold===RELEASE) { expect(width).toBe(120); expect(height).toBeGreaterThanOrEqual(128); }
        // Root-to-cap flanks widen monotonically, without a mushroom shoulder.
        const flank=contour.points.slice(0,49);
        for(let i=1;i<flank.length;i++) {
          const previous=flank[i-1], current=flank[i];
          if(!previous || !current) continue;
          expect(Math.abs(current.x-220)).toBeGreaterThanOrEqual(Math.abs(previous.x-220));
          expect(Math.abs(current.y-140)).toBeGreaterThanOrEqual(Math.abs(previous.y-140));
        }
      }
    }
  });
  test("both orientations: finite ON attachment bands close from OPEN, not only on an axis", () => {
    for(const offset of [-6,-3,0,3,6]) for(let depth=0;depth<=16;depth+=2) {
      for(const point of [{x:220+offset,y:123-depth},{x:220+offset,y:157+depth},{x:261+depth,y:140+offset},{x:179-depth,y:140+offset}]) {
        expect(reedZone(point,"parallel")).toBe("ON");
        expect(reedContact(false,point,"parallel")).toBe(true);
        expect(moveReed({...REED_INITIAL,point,closed:false},point).closed).toBe(true);
      }
    }
    for(const sx of [-1,1]) for(const sy of [-1,1]) for(let x=24;x<=38;x+=2) for(let depth=16;depth<=42;depth+=2) {
      const point={x:220+sx*x,y:140+sy*depth};
      expect(reedZone(point,"perpendicular")).toBe("ON");
      expect(reedContact(false,point,"perpendicular")).toBe(true);
      expect(moveReed({...REED_INITIAL,orientation:"perpendicular",point,closed:false},point).closed).toBe(true);
    }
  });
  test("each ON polygon and every edge midpoint is contained in its own outer contour", () => {
    const contains=(ps:{x:number;y:number}[],q:{x:number;y:number})=>{
      let yes=false;
      for(let i=0,j=ps.length-1;i<ps.length;j=i++) {
        const a=ps[i],b=ps[j]; if(!a||!b)continue;
        const cross=(q.x-a.x)*(b.y-a.y)-(q.y-a.y)*(b.x-a.x);
        if(Math.abs(cross)<1e-7&&q.x>=Math.min(a.x,b.x)-1e-7&&q.x<=Math.max(a.x,b.x)+1e-7&&q.y>=Math.min(a.y,b.y)-1e-7&&q.y<=Math.max(a.y,b.y)+1e-7)return true;
        if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
      }return yes;
    };
    for(const o of ["parallel","perpendicular"] as const) {
      const outer=reedContours(o,RELEASE);
      reedContours(o,ACTIVATE).forEach((c,index)=>{
        const boundary=outer[index]; if(!boundary)throw new Error("Missing outer contour");
        c.points.forEach((q,i)=>{const next=c.points[(i+1)%c.points.length];
          expect(contains(boundary.points,q)).toBe(true);
          if(next)expect(contains(boundary.points,{x:(q.x+next.x)/2,y:(q.y+next.y)/2})).toBe(true);
        });
      });
    }
  });
  test("perpendicular outer HOLD still retains closed but never closes OPEN",()=>{
    for(const sx of [-1,1])for(const sy of [-1,1]) {
      const point={x:220+sx*76,y:140+sy*112};
      expect(reedZone(point,"perpendicular")).toBe("HOLD");
      expect(reedContact(true,point,"perpendicular")).toBe(true);
      expect(reedContact(false,point,"perpendicular")).toBe(false);
    }
    for(const point of [{x:260,y:118},{x:180,y:162},{x:260,y:162},{x:180,y:118}])expect(reedContact(true,point,"parallel")).toBe(false);
  });
  test("OPEN → ON → HOLD → OFF; OFF → same HOLD stays OPEN", () => {
    const on = { x: 305, y: 140 }, hold = { x: 371, y: 140 }, off = { x: 405, y: 140 };
    let s = moveReed(REED_INITIAL, off);
    expect(s.closed).toBe(false);
    s = moveReed(s, on); expect(s.closed).toBe(true); expect(s.progress).toBe(1);
    s = moveReed(s, hold); expect(s.closed).toBe(true); expect(s.progress).toBe(2);
    s = moveReed(s, off); expect(s.closed).toBe(false);
    s = moveReed(s, hold); expect(s.closed).toBe(false);
    expect(reedZone(hold, "parallel")).toBe("HOLD");
    expect(reedContact(true, hold, "parallel")).toBe(true);
    expect(reedContact(false, hold, "parallel")).toBe(false);
  });
  test("orientations really differ, switching only progresses after observed HOLD", () => {
    expect(reedZone({ x: 305, y: 140 }, "parallel")).toBe("ON");
    expect(reedZone({ x: 305, y: 140 }, "perpendicular")).toBe("OFF");
    let s = moveReed(REED_INITIAL, { x: 305, y: 140 });
    expect(orientReed(s, "perpendicular").progress).toBe(1);
    s = moveReed(s, { x: 371, y: 140 });
    s = orientReed(s, "perpendicular"); expect(s.progress).toBe(3);
    expect(s.closed).toBe(false);
    s = moveReed(s, { x: 280, y: 200 }); expect(s.progress).toBe(4); expect(s.closed).toBe(true);
  });
  test("fast paths activate before ending in HOLD, but direct OFF→HOLD does not", () => {
    const s = { ...REED_INITIAL, point: { x: 220, y: 140 } };
    const fast = moveReed(s, { x: 371, y: 140 });
    expect(fast.closed).toBe(true); expect(fast.progress).toBe(2);
    expect(moveReed({ ...s, point: { x: 405, y: 140 } }, { x: 371, y: 140 }).closed).toBe(false);
  });
  test("rotation before first closure recognizes closure; initial orientation cannot cheat final discovery", () => {
    let s = {...REED_INITIAL, point:{x:275,y:195}};
    expect(reedZone(s.point,"parallel")).toBe("OFF");
    s = {...s,orientation:"perpendicular" as const,point:{x:305,y:140}};
    s = orientReed(s,"parallel"); expect(s.closed).toBe(true); expect(s.progress).toBe(1);
    s = moveReed(s,{x:371,y:140}); expect(s.holdOrientation).toBe("parallel");
    s = orientReed(s,"perpendicular"); expect(s.progress).toBe(3);
    s = orientReed(s,"parallel"); s = moveReed(s,{x:305,y:140}); expect(s.progress).toBe(2);
    s = orientReed(s,"perpendicular"); expect(s.closed).toBe(false);
    s = moveReed(s,{x:280,y:200}); expect(s.progress).toBe(4);
  });
  test("rotation to ON in other orientation can itself complete discovery", () => {
    let s = moveReed(REED_INITIAL,{x:305,y:140});
    // This diagonal is HOLD in parallel but ON in perpendicular.
    s = moveReed(s,{x:220,y:179});
    s = moveReed(s,{x:252,y:179});
    expect(s.progress).toBe(2); expect(s.holdOrientation).toBe("parallel");
    s = orientReed(s,"perpendicular"); expect(s.closed).toBe(true); expect(s.progress).toBe(4);
  });
  test("CTM inverse handles scaling, offset and letterboxing, not width-only mapping", () => {
    expect(mapReedPointer(300, 200, { a: 2, b: 0, c: 0, d: 2, e: -400, f: -200 })).toEqual({ x: 200, y: 200 });
    expect(mapReedPointer(200, 300, { a: 0, b: -1, c: 1, d: 0, e: 5, f: 10 })).toEqual({ x: 305, y: -190 });
  });
  test("clamping, invalid inputs and state are independent of path geometry", () => {
    expect(moveReed(REED_INITIAL, { x: NaN, y: 0 })).toBe(REED_INITIAL);
    expect(moveReed(REED_INITIAL, { x: 1000, y: -50 }).point).toEqual({ x: 406, y: 34 });
    const before = reedContours("parallel", ACTIVATE);
    moveReed(REED_INITIAL, { x: 305, y: 140 });
    expect(reedContours("parallel", ACTIVATE)).toEqual(before);
  });
});

function preparePointer(view: ReturnType<typeof render>) {
  const svg = view.getByRole("img");
  Object.defineProperty(svg, "getScreenCTM", { configurable: true, value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }) });
  const handle = view.getByTestId("reed-handle");
  const captured = new Set<number>();
  Object.assign(handle, { setPointerCapture: (id: number) => captured.add(id), hasPointerCapture: (id: number) => captured.has(id), releasePointerCapture: (id: number) => captured.delete(id) });
  return { handle, captured };
}

describe("Rendered discovery interactions", () => {
  test("invitation is decorative, not triggered by toggles, completed for tab lifetime by a key", () => {
    const v=render(<MagnetPlay />);
    const hint=v.getByTestId("reed-invitation");
    expect(hint.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(v.getByRole("button",{name:"Perpendiculaire"}));
    fireEvent.click(v.getByRole("button",{name:"Voir à l'intérieur"}));
    expect(v.queryByTestId("reed-invitation")).toBeTruthy();
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
    fireEvent.keyDown(v.getByTestId("reed-handle"),{key:"Tab"});
    expect(v.queryByTestId("reed-invitation")).toBeTruthy();
    fireEvent.keyDown(v.getByTestId("reed-handle"),{key:"ArrowLeft"});
    expect(v.queryByTestId("reed-invitation")).toBeNull();
    v.unmount();
    const again=render(<MagnetPlay />);
    expect(again.queryByTestId("reed-invitation")).toBeNull();
  });
  test("current uses a lighter, thinner shared flow than the signal blades", () => {
    const css = readFileSync("src/components/leadmagnet/reed-discovery.css", "utf8");
    const flow = css.match(/\.reed-current \{([^}]+)\}/)?.[1];
    expect(flow).toContain("stroke: var(--reed-current)");
    expect(flow).toContain("stroke-width: 1.5");
    expect(flow).toContain("stroke-dasharray: 3 12");
    expect(css).toContain("stroke-dashoffset: -30");
    expect(css).toContain("animation: none !important");
  });
  test("current and signal follow closed in opaque/interior and HOLD, disappear open; no sleeve or central ring", () => {
    const v=render(<MagnetPlay />); const {handle}=preparePointer(v);
    const evt={pointerId:9,pointerType:"mouse",isPrimary:true,button:0};
    expect(v.queryByTestId("reed-cable-current")).toBeNull();
    expect(v.queryByTestId("reed-contact-current")).toBeNull();
    expect(v.container.querySelector('rect[x="168"]')).toBeNull();
    expect(v.getByTestId("reed-zones").querySelectorAll("circle,ellipse")).toHaveLength(0);
    expect(v.getAllByTestId("reed-on-contour")).toHaveLength(4);
    fireEvent.pointerDown(handle,{...evt,clientX:365,clientY:225});
    fireEvent.pointerMove(handle,{...evt,clientX:305,clientY:140});
    expect(v.getByTestId("reed-cable-current")).toBeTruthy();
    expect(v.queryByTestId("reed-contact-current")).toBeNull();
    expect(v.getByTestId("reed-housing").getAttribute("stroke")).toBe("var(--reed-closed)");
    expect(v.getByTestId("reed-interior").getAttribute("visibility")).toBe("hidden");
    fireEvent.click(v.getByRole("button",{name:"Voir à l'intérieur"}));
    expect(v.queryByTestId("reed-housing-reflection")).toBeNull();
    expect(v.getByTestId("reed-contact-current")).toBeTruthy();
    expect(v.getByTestId("reed-left-blade").getAttribute("stroke")).toBe("var(--reed-closed)");
    fireEvent.pointerMove(handle,{...evt,clientX:371,clientY:140});
    expect(v.getByTestId("reed-discovery").dataset.zone).toBe("HOLD");
    expect(v.getByTestId("reed-cable-current")).toBeTruthy();
    fireEvent.pointerMove(handle,{...evt,clientX:405,clientY:140});
    expect(v.queryByTestId("reed-cable-current")).toBeNull();
    expect(v.queryByTestId("reed-contact-current")).toBeNull();
    fireEvent.pointerMove(handle,{...evt,clientX:371,clientY:140});
    expect(v.getByTestId("reed-discovery").dataset.zone).toBe("HOLD");
    expect(v.queryByTestId("reed-cable-current")).toBeNull();
    fireEvent.pointerUp(handle,evt);
    fireEvent.click(v.getByRole("button",{name:"Voir à l'intérieur"}));
    expect(v.getByTestId("reed-housing-reflection")).toBeTruthy();
  });
  test("rotation closure updates the instruction and returning to initial ON does not finish", () => {
    const v = render(<MagnetPlay />); const { handle } = preparePointer(v);
    const evt = { pointerId: 4, pointerType: "mouse", isPrimary: true, button: 0 };
    fireEvent.click(v.getByRole("button", { name: "Perpendiculaire" }));
    fireEvent.pointerDown(handle, { ...evt, clientX:365, clientY:225 });
    fireEvent.pointerMove(handle, { ...evt, clientX:405, clientY:225 });
    fireEvent.pointerMove(handle, { ...evt, clientX:405, clientY:140 });
    fireEvent.pointerMove(handle, { ...evt, clientX:305, clientY:140 });
    fireEvent.pointerUp(handle, evt);
    fireEvent.click(v.getByRole("button", { name: "Parallèle" }));
    expect(v.getByTestId("reed-discovery").dataset.progress).toBe("1");
    expect(v.getByText("Reculez doucement dans la zone de maintien.")).toBeTruthy();
    fireEvent.pointerDown(handle,{...evt,clientX:305,clientY:140});
    fireEvent.pointerMove(handle,{...evt,clientX:371,clientY:140});
    fireEvent.pointerUp(handle,evt);
    fireEvent.click(v.getByRole("button", { name: "Perpendiculaire" }));
    fireEvent.click(v.getByRole("button", { name: "Parallèle" }));
    fireEvent.pointerDown(handle,{...evt,clientX:371,clientY:140});
    fireEvent.pointerMove(handle,{...evt,clientX:305,clientY:140});
    fireEvent.pointerUp(handle,evt);
    expect(v.getByTestId("reed-discovery").dataset.progress).toBe("2");
    expect(v.queryByText("Hystérésis observée. Continuez à explorer librement.")).toBeNull();
  });
  test("initial complete sensor opaque; no bogus distances, no integrated indicator", () => {
    const v = render(<MagnetPlay />);
    expect(v.getByTestId("reed-interior").getAttribute("visibility")).toBe("hidden");
    expect(v.getByTestId("reed-zones").getAttribute("visibility")).toBe("visible");
    expect(v.getByRole("status").textContent).toContain("Contact ouvert");
    expect(v.container.textContent).not.toMatch(/\d+\s*mm|LED|Détecté à/);
  });
  for (const pointerType of ["mouse", "touch"] as const) test(`${pointerType}: capture, drag, hysteresis, release and cancel`, () => {
    const v = render(<MagnetPlay />); const { handle, captured } = preparePointer(v);
    const evt = { pointerId: 7, pointerType, isPrimary: true, button: 0 };
    fireEvent.pointerDown(handle, { ...evt, clientX: 365, clientY: 225 }); expect(captured.has(7)).toBe(true);
    fireEvent.pointerMove(handle, { ...evt, clientX: 305, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    fireEvent.pointerMove(handle, { ...evt, clientX: 371, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.progress).toBe("2");
    fireEvent.pointerUp(handle, evt); expect(captured.size).toBe(0);
    fireEvent.pointerMove(handle, { ...evt, clientX: 405, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    fireEvent.pointerDown(handle, { ...evt, clientX: 371, clientY: 140 });
    fireEvent.pointerCancel(handle, evt); expect(captured.size).toBe(0);
    fireEvent.pointerMove(handle, { ...evt, clientX: 405, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
  });
  test("lost capture and secondary pointer cannot leave a dragging state", () => {
    const v = render(<MagnetPlay />); const { handle } = preparePointer(v);
    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 365, clientY: 225 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 305, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 305, clientY: 140 }); expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
  });
  test("keyboard moves in both axes; visual toggles never change contact; blades meet when closed", () => {
    const v = render(<MagnetPlay />); const handle = v.getByTestId("reed-handle");
    for (let i = 0; i < 11; i++) fireEvent.keyDown(handle, { key: "ArrowUp" });
    for (let i = 0; i < 7; i++) fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    fireEvent.click(v.getByRole("button", { name: "Champ magnétique" }));
    fireEvent.click(v.getByRole("button", { name: "Voir à l'intérieur" }));
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("true");
    expect(v.getByTestId("reed-interior").getAttribute("visibility")).toBe("visible");
    expect(v.getByTestId("reed-left-blade").getAttribute("d")).toBe("M181 140 H218 L226 140");
    expect(v.getByTestId("reed-right-blade").getAttribute("d")).toBe("M258 140 H234 L222 140");
    expect(v.getAllByTestId("reed-on-contour")).toHaveLength(4);
    const before = v.getAllByTestId("reed-on-contour")[0]?.getAttribute("d");
    fireEvent.click(v.getByRole("button", { name: "Perpendiculaire" }));
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
    expect(v.getAllByTestId("reed-on-contour")[0]?.getAttribute("d")).not.toBe(before);
  });
  test("CTA invokes existing callback once; home keeps DesignSpace mounted", () => {
    let calls = 0; const v = render(<MagnetPlay onStart={() => calls++} />);
    fireEvent.click(v.getByRole("button", { name: "Trouver un capteur pour mon application" })); expect(calls).toBe(1);
    const home = readFileSync("src/routes/index.tsx", "utf8");
    expect(home).toContain("<MagnetPlay onStart={openWorkspace} />");
    expect(home).toContain("<DesignSpace"); expect(home).not.toContain("{started && <DesignSpace");
  });
  for (const locale of LANGUAGES) test(`${locale.id}: all controls and instructions translate without changing state`, () => {
    const v = render(<MagnetPlay onStart={() => {}} />);
    act(() => setLocale(locale.id));
    for (const key of ["Champ magnétique", "Voir à l'intérieur", "Parallèle", "Perpendiculaire", "Trouver un capteur pour mon application", "Déplacer l'aimant dans le plan"]) {
      expect(v.getByRole("button", { name: t(key, locale.id) })).toBeTruthy();
    }
    const perpendicular = v.getByRole("button", { name: t("Perpendiculaire", locale.id) });
    expect(perpendicular.textContent).toBe(t("À 90°", locale.id));
    expect(perpendicular.getAttribute("title")).toBe(t("Perpendiculaire", locale.id));
    expect(perpendicular.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(perpendicular);
    expect(perpendicular.getAttribute("aria-pressed")).toBe("true");
    expect(v.getByRole("status").textContent).toContain(t("Contact ouvert", locale.id));
    expect(v.getByTestId("reed-discovery").dataset.closed).toBe("false");
    expect(v.getByText(t("Conserve l'état précédent", locale.id))).toBeTruthy();
    fireEvent.click(v.getByRole("button", { name: t("Champ magnétique", locale.id) }));
    expect(v.getByTestId("reed-zones").getAttribute("visibility")).toBe("hidden");
    expect(v.container.textContent).toContain("NS");
  });
});
