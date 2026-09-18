import { COMPILED_PUBLISHED_REGISTRY as R } from "../src/lib/standex/magnetics/registries";
import { registryCoverage, currentMountingProfiles } from "../src/lib/standex/mounting/profiles";
for (const a of ["D1","D3"]) console.log(a, R.rows.filter(r=>r.sensorFamily==="MK03"&&r.magnetId==="4003004003"&&r.approachId===a).map(r=>[r.sensitivityClass,r.pullInMm,r.dropOutMm]));
const c = registryCoverage();
console.log(JSON.stringify({rows:c.rows,fam:c.families.length,mag:c.magnets.length,classes:c.classes,appr:c.approaches}));
