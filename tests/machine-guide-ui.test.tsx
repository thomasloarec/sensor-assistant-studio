/** Interface du parcours guidé : une étape à la fois et validations visibles. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import MachineGuide, { INITIAL_GUIDE } from "../src/components/standex/workshop/machine-guide";
import type { GuideState } from "../src/components/standex/workshop/machine-guide";
import { COFFEE_ASSEMBLY } from "../src/lib/standex/machine-assembly";
import type { MachineAssembly } from "../src/lib/standex/machine-assembly";
import type { MachineAsset } from "../src/lib/standex/machine-assets";
import { DEFAULT_WORKSHOP, simulateCycle, unavailableReason } from "../src/lib/standex/magnetic-workshop";
import type { WorkshopConfig } from "../src/lib/standex/magnetic-workshop";

const noop = () => undefined;
const asset = (parts: number): MachineAsset =>
  ({
    parts: Array.from({ length: parts }, (_, i) => ({ path: "0/" + i, name: "P" + i })),
    nodes: [
      { path: "0", name: "Racine_Client", depth: 0, meshCount: parts },
      ...Array.from({ length: parts }, (_, i) => ({ path: "0/" + i, name: "Piece_" + i, depth: 1, meshCount: 1 })),
    ],
    size: [100, 50, 80],
    center: [0, 0, 0],
    min: [0, 0, 0],
    animationCount: 0,
    dispose: noop,
  }) as unknown as MachineAsset;
const fresh: MachineAssembly = {
  ...structuredClone(COFFEE_ASSEMBLY),
  assetKey: "sha256:" + "b".repeat(64),
  fileName: "Montage client.glb",
  movingNode: "",
  movingNodes: [],
  travel: [0, 0, 0],
  motionStatus: "unset",
};
function render(step: GuideState["step"], machine = fresh, parts = 3, patch: Partial<WorkshopConfig> = {}) {
  const config: WorkshopConfig = { ...DEFAULT_WORKSHOP, mode: "education", magnetModel: "generic", machine, ...patch };
  const result = simulateCycle(config);
  return renderToStaticMarkup(
    <MachineGuide
      state={{ ...INITIAL_GUIDE, step }}
      setState={noop}
      config={config}
      asset={asset(parts)}
      tool="navigate"
      setTool={noop}
      onChange={noop}
      history={{ canUndo: false, canRedo: false, undo: noop, redo: noop }}
      sample={result.samples[0]!}
      progress={0}
      setProgress={noop}
      playing={false}
      setPlaying={noop}
      reason={unavailableReason(config)}
      onDemo={noop}
    />,
  );
}

describe("parcours guidé du modèle importé", () => {
  test("cinq étapes, une seule développée", () => {
    const html = render("model");
    for (const s of ["model", "parts", "motion", "install", "test"]) expect(html).toContain(`guide-step-${s}`);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).not.toContain("guide-validate-motion");
  });
  test("le nom de fichier n'est jamais traduit et un monobloc est expliqué", () => {
    expect(render("model", fresh, 1)).toContain("guide-monobloc");
    expect(render("model", fresh, 3)).not.toContain("guide-monobloc");
    expect(render("model")).toContain("Montage client.glb");
    expect(render("parts")).toContain('translate="no"');
    expect(render("parts")).toContain("Piece_1");
  });
  test("nouvel import : ensemble fixe par défaut", () => {
    expect(render("parts")).toContain("Aucune pièce mobile");
  });
  test("mouvement sans course : validation impossible et raison affichée", () => {
    const html = render("motion", { ...fresh, movingNodes: ["0/1"], movingNode: "0/1", motionStatus: "draft" });
    expect(html).toMatch(/data-testid="guide-validate-motion"[^>]*disabled/);
    expect(html).toContain("Course invalide");
  });
  test("mouvement valide : validation possible", () => {
    const html = render("motion", { ...fresh, movingNodes: ["0/1"], movingNode: "0/1", travel: [0, 0, 40], axisVector: [0, 0, 1], motionStatus: "draft" });
    expect(html).not.toMatch(/data-testid="guide-validate-motion"[^>]*disabled/);
  });
  test("« À travers une paroi » désactivé pour un corps non cylindrique", () => {
    const blockSensor = render("install", fresh, 3, { sensorId: "MK15" });
    expect(blockSensor).toMatch(/aria-checked="false" disabled="">À travers une paroi/);
    const cyl = render("install", fresh, 3, { sensorId: "MK03" });
    expect(cyl).not.toMatch(/disabled="">À travers une paroi/);
  });
  test("essai : la source du contact est affichée et le mouvement non validé bloque", () => {
    const html = render("test");
    expect(html).toContain("guide-source");
    expect(html).toContain("pièce mobile");
    const ok = render("test", structuredClone(COFFEE_ASSEMBLY));
    expect(ok).toContain("Contact illustratif");
    expect(ok).toContain("Ouverture du mécanisme");
  });
});
