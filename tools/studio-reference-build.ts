/** Compile documented observations independently of their still-unknown 3D geometry. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCsv } from "./registry-validate";
const input = readFileSync("registres/en-attente/R2_calibration_capteurs_V1.csv", "utf8");
const parsed = parseCsv(input),
  header = parsed[0]!.cells;
const rows = parsed.slice(1).map((line) => {
  const row = Object.fromEntries(header.map((h, i) => [h, line.cells[i]!]));
  const pull = Number(row["pull_in_mm"]),
    drop = Number(row["drop_out_mm"]);
  if (
    !row["source_ref"] ||
    !Number.isFinite(pull) ||
    pull <= 0 ||
    !Number.isFinite(drop) ||
    drop <= pull
  )
    throw new Error("Invalid published observation");
  return {
    id: row["calibration_id"],
    sensorFamily: row["sensor_family"],
    sensorReference: row["sensor_reference"],
    sensitivityClass: row["sensitivity_class"],
    contactForm: row["contact_form"],
    magnetId: row["magnet_id"],
    approachId: row["approach_id"],
    pullInMm: pull,
    dropOutMm: drop,
    temperatureC: null,
    provenance: {
      registryId: row["calibration_id"],
      sourceType: "published_table",
      sourceRef: row["source_ref"],
      enteredOn: row["entered_on"],
      fields: ["pullInMm", "dropOutMm", "hysteresisMm"],
    },
  };
});
mkdirSync("src/data/studio-v2", { recursive: true });
writeFileSync(
  "src/data/studio-v2/published-references.json",
  JSON.stringify(
    {
      version: "published-reference-1.0.0",
      sourceSha256: createHash("sha256").update(input).digest("hex"),
      rows,
    },
    null,
    2,
  ) + "\n",
);
