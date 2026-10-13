# Lead magnet rules


- Global blocking in `application-fit.ts` only for impossible modality or values beyond every verified datasheet limit; per-series temperature limits are non-blocking warnings in `thermal-fit.ts`, read only from `sensor-specifications.ts`, so no rating is ever invented.
- `checkSubmission` requires each essential business field to hold a real value or an explicit "not defined" marker, because a default must never read as an answer.
- Business RPC errors expose only exact allowlisted field labels through localized templates, so database internals never reach the interface.

- Order suggested pairs through `suggestion-ranking.ts` (explicit, reasoned tiers), never catalog insertion order: specialised families must not reach the top three without a verified written requirement.
