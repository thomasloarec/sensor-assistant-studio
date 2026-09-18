import { pairCardFor } from "../src/lib/leadmagnet/pair-cards";
import { sensorById } from "../src/lib/standex/sensor-catalog";
import { guideRangesFor } from "../src/lib/standex/activation-guide";
for (const id of ["MK15","MK16","MK17","MK14","MK18"]) {
  const c = pairCardFor(sensorById(id));
  console.log(id, c.magnetId, c.maxPullInMm, c.hasGuideRange, guideRangesFor(id, c.magnetId).length);
}
