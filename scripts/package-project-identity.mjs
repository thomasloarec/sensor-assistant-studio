/** Prepare the exact four-file Supabase Edge bundle without copying credentials. */
import { mkdir, copyFile, writeFile } from "node:fs/promises";
const dest = "tmp/project-identity/supabase/functions/project-identity";
await mkdir(dest, { recursive: true });
await copyFile("supabase/edge-functions-src/project-identity/index.ts", dest + "/index.ts");
for (const file of ["project-identity.server.ts", "project-identity.ts", "industries.ts"])
  await copyFile("src/lib/leadmagnet/" + file, dest + "/" + file);
await writeFile(
  "tmp/project-identity/supabase/config.toml",
  "[functions.project-identity]\nverify_jwt = true\n",
);
console.log("Edge bundle: " + dest);
