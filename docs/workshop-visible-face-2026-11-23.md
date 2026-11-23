# Mount on the visible side of an imported surface

The blender's `Cube.001_BlackPlastic_0` uses a double-sided material. A ray
cast from inside hits the same triangle as a ray cast from outside. Three.js
returns the triangle's original normal in both cases. Adding half the MK15's
height along that normal therefore placed it outside even after an inside click.

`visibleFaceNormal` transforms the geometric normal into world coordinates and
orients it against the click ray. Both guided and free placement use it. Guided
placement then converts the point and this normal to the support's static pose,
so moving supports continue to follow the existing transform and history paths.

Finite-face recovery accepts the reverse winding only when the original material
allows that side, including geometry material groups. The plane, connected
component, edge, hole and full-footprint checks remain in effect. Existing saved
attachments are not migrated: reselect the mounting face to apply the correction.

## Reproduction on the real blender

Asset SHA-256: `b513aa25553c2649194c5d9bb3933eb3edc1ab4b83ce3d819970780252dc8c27`.
At the example's illustrative scale of 10, rays from `(110,420,0)` upwards and
`(110,480,0)` downwards both hit approximately `(110,444.737,0)`. The original
triangle normal has Y `+0.976` in both cases. With a zero mounting offset the
corrected MK15 centre has Y `443.517` for the inside click and `445.957` for the
outside click. These are geometric regression values, not certified dimensions.

The licensed GLB is not included in the repository. Set `BLENDER_GLB_PATH` to a
local copy and run `bun test tests/machine-visible-face.test.ts` to include the
real-file regression. Without that variable, the five synthetic regression tests
still run: both sides, world transforms, thick walls, material-sided finite faces,
and attachment/movement preservation for sensor and magnet.

Browser verification used the production `MachineScene`, `attachFromHit` and
`attachPatch` with the original GLB in a temporary local harness. Real clicks from
inside and outside produced the respective normals and centres above. The live
user montage was restored after inspection; the local harness is not shipped.
