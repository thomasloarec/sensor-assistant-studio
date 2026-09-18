import { approachChoicesFor, publishedClasses } from "../src/lib/standex/magnetic-workshop";
import { guideRangesFor } from "../src/lib/standex/activation-guide";
for (const id of ["MK15","MK16"]) {
  console.log(id, approachChoicesFor(id,"HF3225-14.95X10X5"), publishedClasses(id,"HF3225-14.95X10X5"));
  console.log(guideRangesFor(id,"HF3225-14.95X10X5").slice(0,6));
}
