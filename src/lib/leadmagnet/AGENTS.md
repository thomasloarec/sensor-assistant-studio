# Lead magnet rules

- MK06 sizes are evaluated separately before display grouping. PCB through-hole includes THT, CMS excludes it. The MK06 electrical check accepts only explicit unambiguous confirmed ratings and requires one documented contact to satisfy all limits; ambiguous load/interface descriptions stay for engineering review. Never combine limits from different contacts or hide the exact suggested size behind the family title.


- Global blocking in `application-fit.ts` only for impossible modality or values beyond every verified datasheet limit; per-series temperature limits are non-blocking warnings in `thermal-fit.ts`, read only from `sensor-specifications.ts`, so no rating is ever invented.
- `checkSubmission` requires each essential business field to hold a real value or an explicit "not defined" marker, because a default must never read as an answer.
- Business RPC errors expose only exact allowlisted field labels through localized templates, so database internals never reach the interface.

- Order suggested pairs through `suggestion-ranking.ts` (explicit, reasoned tiers), never catalog insertion order: specialised families (except MK26, ranked on ordinary criteria) must not reach the top three without a verified written requirement.
