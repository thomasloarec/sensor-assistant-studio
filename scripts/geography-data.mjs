/** Download GeoNames reference data, never prospect data. CC BY 4.0.
 * node scripts/geography-data.mjs FR DE US ...
 * Output is SQL for an operator to import into the target database with psql.
 * All populated places are included (no population threshold). No API key.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";
const out = "tmp/geography";
await mkdir(out, { recursive: true });
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
async function download(file) {
  const response = await fetch("https://download.geonames.org/export/dump/" + file);
  if (!response.ok) throw new Error("GeoNames HTTP " + response.status);
  return new Uint8Array(await response.arrayBuffer());
}
const regionBytes = await download("admin1CodesASCII.txt");
const regions = strFromU8(regionBytes)
  .trim()
  .split("\n")
  .map((l) => l.split("\t"));
const ids = new Set(regions.map((r) => r[0]));
const countryText = strFromU8(await download("countryInfo.txt"));
const countries = countryText
  .split("\n")
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t")[0]);
await writeFile(
  out + "/countries.sql",
  "insert into lead.geo_countries(code) values " +
    countries
      .filter((c) => /^[A-Z]{2}$/.test(c))
      .map((c) => "(" + quote(c) + ")")
      .join(",") +
    " on conflict do nothing;",
);
await writeFile(
  out + "/regions.sql",
  "insert into lead.geo_regions(country,code,name) values\n" +
    regions
      .map((r) => "(" + [r[0].slice(0, 2), r[0], r[1]].map(quote).join(",") + ")")
      .join(",\n") +
    "\non conflict(code) do update set name=excluded.name;\n",
);
const manifest = {
  source: "https://download.geonames.org/export/dump/",
  license: "CC BY 4.0",
  downloadedAt: new Date().toISOString(),
  regionsSha256: createHash("sha256").update(regionBytes).digest("hex"),
  countries: [],
};
for (const country of process.argv.slice(2)) {
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("Expected ISO country code");
  const bytes = await download(country + ".zip");
  const files = unzipSync(bytes);
  const text = strFromU8(files[country + ".txt"]);
  const cities = text
    .trim()
    .split("\n")
    .map((l) => l.split("\t"))
    .filter(
      (r) =>
        r[6] === "P" &&
        !["PPLH", "PPLQ", "PPLW"].includes(r[7]) &&
        r[8] === country &&
        ids.has(country + "." + r[10]),
    );
  const rows = cities.map(
    (r) =>
      "(" +
      [
        r[0],
        r[1],
        country,
        country + "." + r[10],
        r[11] || "",
        ("|" + [r[1], r[2], ...r[3].split(",")].join("|"))
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .slice(0, 1600),
      ]
        .map(quote)
        .join(",") +
      ")",
  );
  const chunks = [];
  for (let i = 0; i < rows.length; i += 1000) {
    const file = country + "-" + String(i / 1000).padStart(4, "0") + ".sql";
    await writeFile(
      out + "/" + file,
      "insert into lead.geo_cities(id,name,country,region_code,district,search_name) values\n" +
        rows.slice(i, i + 1000).join(",\n") +
        "\non conflict(id) do update set name=excluded.name, country=excluded.country, region_code=excluded.region_code, district=excluded.district,search_name=excluded.search_name;\n",
    );
    chunks.push(file);
  }
  const finish = country + "-complete.sql";
  await writeFile(
    out + "/" + finish,
    `insert into lead.geo_imports(country,imported_at,source_sha256,place_count) values(${quote(country)},now(),${quote(createHash("sha256").update(bytes).digest("hex"))},${cities.length}) on conflict(country) do update set imported_at=excluded.imported_at,source_sha256=excluded.source_sha256,place_count=excluded.place_count;`,
  );
  manifest.countries.push({
    country,
    count: cities.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    chunks,
    finish,
  });
  console.log(country + ": " + cities.length + " places");
}
await writeFile(out + "/manifest.json", JSON.stringify(manifest, null, 2));
console.log("SQL and provenance: " + out);
