import type { DesignFreeze } from "./design-freeze";

const encoder = new TextEncoder();
/** Local PDF pages preserve Unicode and brand rendering through the browser's fonts.
 * JSON and Excel retain searchable structured values; no server receives the dossier. */
export async function reviewPdf(
  f: DesignFreeze,
  logoUrl: string,
  translate: (text: string) => string = (text) => text,
): Promise<Uint8Array> {
  await document.fonts.ready;
  const logo = new Image();
  logo.src = logoUrl;
  await logo.decode();
  const pages: Uint8Array[] = [];
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PDF_CANVAS_UNAVAILABLE");
  let y = 0;
  function start() {
    ctx!.fillStyle = "#ffffff";
    ctx!.fillRect(0, 0, 1240, 1754);
    ctx!.drawImage(logo, 84, 62, 310, (310 * 141) / 600);
    ctx!.fillStyle = "#254061";
    ctx!.font = "bold 31px Arial";
    ctx!.fillText(translate("Fiche de revue de conception"), 84, 190);
    ctx!.fillStyle = "#56616b";
    ctx!.font = "20px Arial";
    ctx!.fillText("Sensor Studio · " + translate("Non contre-signée"), 84, 226);
    ctx!.fillStyle = "#254061";
    ctx!.fillRect(84, 250, 1072, 3);
    y = 295;
  }
  function finish() {
    ctx!.fillStyle = "#56616b";
    ctx!.font = "18px Arial";
    ctx!.fillText("Standex Electronics · Sensor Studio", 84, 1695);
    ctx!.fillText(String(pages.length + 1), 1130, 1695);
    const b = atob(canvas.toDataURL("image/jpeg", 0.94).split(",")[1]!);
    pages.push(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  }
  function wrapped(text: string, bold = false) {
    ctx!.font = `${bold ? "bold " : ""}22px Arial`;
    // Break by Unicode character as well as whitespace, including long hashes/URLs.
    const lines: string[] = [];
    let current = "";
    for (const c of text) {
      if (c === "\n" || ctx!.measureText(current + c).width > 1072) {
        lines.push(current);
        current = c === "\n" ? "" : c;
      } else current += c;
    }
    if (current) lines.push(current);
    return lines;
  }
  function line(text: string, bold = false) {
    for (const l of wrapped(text, bold)) {
      if (y > 1610) {
        finish();
        start();
      }
      ctx!.font = `${bold ? "bold " : ""}22px Arial`;
      ctx!.fillStyle = bold ? "#254061" : "#37434d";
      ctx!.fillText(l, 84, y);
      y += 31;
    }
  }
  start();
  for (const s of f.sections) {
    if (y > 1490) {
      finish();
      start();
    }
    y += 16;
    line(`${s.id}. ${translate(s.title)}`, true);
    y += 8;
    for (const e of s.entries) {
      const blockHeight =
        31 * (wrapped(translate(e.label), true).length + wrapped(translate(e.value)).length);
      if (y + Math.min(blockHeight, 200) > 1610) {
        finish();
        start();
      }
      line(translate(e.label), true);
      line(translate(e.value));
      y += 12;
    }
  }
  y += 18;
  line("SHA-256", true);
  line(f.hash);
  finish();
  return imagePagesPdf(pages, 1240, 1754);
}
export function imagePagesPdf(pages: Uint8Array[], width: number, height: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [0];
  const raw = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const text = (s: string) => raw(encoder.encode(s));
  const obj = (id: number, s: string) => {
    offsets[id] = length;
    text(`${id} 0 obj\n${s}\nendobj\n`);
  };
  text("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`,
  );
  pages.forEach((jpg, i) => {
    const id = 3 + i * 3;
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
    );
    offsets[id + 1] = length;
    text(
      `${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
    );
    raw(jpg);
    text("\nendstream\nendobj\n");
    const commands = "q 595.276 0 0 841.89 0 0 cm /Im0 Do Q\n";
    obj(id + 2, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  });
  const xref = length;
  text(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const p of offsets.slice(1)) text(`${String(p).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
