# Sensor Studio — user feedback corrections, 11 September 2026

The first user acceptance run exposed missing product data, confusing example defaults, fragmented navigation and export controls, and misleading mechanical illustrations. This revision addresses the 28 tracked feedback items across data, comparison, dossier, catalogue, scene and export flows.

## Delivered behavior

- 258 sourced distance pairs across 13 families, with D1–D5 and their actual packaged magnet references. Five Web/PDF contradictions are withheld explicitly (source-conflicts.json); missing data never produces a number. Physical calibration remains unavailable pending active geometry, datums, remanence and independent data.
- A product must be explicitly retained. Merely opening the demo or inspecting a row cannot populate the client's intended product. Changing the comparison approach invalidates the selection. Confirmed dossier fields retain their conflict semantics.
- Five need inputs with adjacent vocabulary help, precise invalid/missing states, conditional unknown tolerances and an explanation of absent thermal correction. Secondary technical information is collapsed.
- Persistent vertical navigation separates project/account, workshop, catalogue and documents. Inline catalogue mounting no longer closes itself under StrictMode.
- Product drawings share a light background and fixed orthographic scale. Bare reed capsules have two opposing leads, surface mount models have no cable, and routed cable geometry no longer doubles the body wires. Seven requested products plus MK06-4 have qualified datasheet dimensions/specifications. Envelopes remain simplified, not production CAD.
- Single prominent GLB import; discrete coffee example; machine piece and placement guidance. Magnet surface offset uses actual selected body height. Circuit and playback sit immediately under the compact scene.
- One review export menu: branded paginated local PDF, six-sheet FR/EN Excel, JSON and Markdown. Excel preserves numeric cells, unknown blanks, source rows, qualified catalogue specifications and settings. PDF is rasterized for reliable local Unicode/font rendering; structured data remains in Excel/JSON.

## Validation

499 tests, 57,124 assertions, 51 suites: all pass. TypeScript check and production build pass. Translation inventory: zero untranslated/missing/code-translated strings. Seven non-French translations supplied. Design scans show only the pre-existing theme-color exception and unmigrated UI primitives.

Browser checks: main project/menu/catalogue, bare reed card, actual MK04/M04 pair, D4 comparison, invalid input, explicit retain/freeze, PDF and Excel downloads, coffee GLB animation/contact and compact controls. Supplied simple GLB loads at 120 × 40 × 80 mm; documented translation/rotation settings produce closed/open/closed in regression tests.

The browser automation extension refused local-file upload permission. No workaround was used. Direct file loading and the supplied fixture are covered automatically, while the user's second manual import run remains required. No database migration was applied, no real customer data entered, no public publication performed.

User-provided case 12 JSON/Markdown, found in Downloads, were consistent. verifyFreeze accepted the original and rejected case 13's sole change M02 → M04. Copies and detailed French audit are in the user's local tracking folder, not in the repository.

## Local acceptance material

The Lead Magnet folder contains SUIVI_CORRECTIONS_2026-09-11 with 28-item tracking, source divergences, optional simplifications, export audit, example exports and RECETTE_DES_CORRECTIONS.html. The original 20-case procedure and its HTML entrypoint were updated, including corrected machine poses and explicit solution selection.

Engine: studio-v2-1.1.0. Published registry: published-2026-09-11. Physics registry unchanged. Connected main branch is intended for private Lovable preview only.
