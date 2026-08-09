# Brawl & Seek - generation log

Recovered from project history on 27-07-2026. Historical rows and running total are preserved from commit `8c6667b`; the file had been absent from the working tree.

- Historical recorded total through the v30 composition batch: approximately US$7.57. See `git show 8c6667b:assets/GENERATION-LOG.md` for the full historical table.
- Directive 014 carries forward one dedicated fossil-sprite unit: exactly two initial Gemini images, estimated US$0.04-US$0.08. One two-image retry is allowed only if the rendered fossil gate fails; absolute cap US$0.08-US$0.16.
- No Directive 014 generation call was made: the authorised Gemini-only tool was unavailable in this session. Spend for Directive 014 is US$0.00; no candidates or retry were created.

## Directive 014A generation call 1 — 27/07/2026

- Provider/model: Gemini `gemini-3.1-flash-image` via the configured workflow.
- Purpose: two isolated fossil sprite-sheet candidates (skull, rib cluster, bone pair, loose bone), flat keyable background, no scene/UI/props/characters.
- Candidate count: 2. Estimated call cost: US$0.04–US$0.08. Running Directive 014A spend before result: US$0.04–US$0.08.
- Source references: `acid-lakes-source-30s-native.png`, `acid-lakes-source-45s-native.png`.
- Status: completed. Candidates `v53a-fossil-candidate-1.png` and `v53a-fossil-candidate-2.png` are preserved; candidate 2 selected after native-size inspection. Estimated actual call cost US$0.04–US$0.08; Directive 014A spend remains within the authorised cap. No key material is recorded.

## Directive 014B generation retry - 28/07/2026

- Provider/model: Gemini `gemini-3.1-flash-image` via the configured workflow.
- Purpose: final authorised two-image retry for pale, low-contrast Acid Lakes fossil floor decals; no outline, glow, halo, scene, UI or characters.
- Candidate count: 2. Estimated call cost: US$0.04-US$0.08. This is the single remaining retry under Directive 014B.
- Source references: `acid-lakes-source-30s-native.png`, `acid-lakes-source-45s-native.png`.
- Status: authorised and started; no key material is recorded.
- Result: candidates `v53b-fossil-retry-1.png` and `v53b-fossil-retry-2.png` are preserved; retry-1 was keyed and wired as the provisional raw implementation input. PM review remains required. No key material is recorded.
## Directive 028Y generation unit 1 — 30/07/2026

- Provider/model: Gemini `gemini-3.1-flash-image` via the configured API workflow.
- Purpose: two candidate 3x2 isolated Acid Lakes bush sprite sheets for deterministic grid-owned sprites; solid `#FF00FF` key, no scene/UI/characters.
- Candidate count: 2. Authorised unit: 1 of maximum 2; estimated cost US$0.04–US$0.08.
- Source references: `Art/2026-07-30 - Directive 028Y/reference-frame-18s-f536.png`, `reference-frame-27s-f803.png`, `reference-frame-29s-f863.png`, `reference-frame-35s-f1041.png`, `reference-frame-43s-f1280.png`, `reference-frame-45s-f1339.png`, plus approved `assets/world/d002-bush-grid-retry-1.png` and `truth-bush-selected.png`.
- Status: authorised and started; raw outputs will be preserved, no key material recorded.
- Result: completed. Raw candidates `Art/2026-07-30 - Directive 028Y/v55-d028y-bush-kit-candidate-1.png` and `v55-d028y-bush-kit-candidate-2.png` are preserved. No key material recorded.
## Directive 028Y generation unit 2 (final corrective unit) — 30/07/2026

- Provider/model: Gemini `gemini-3.1-flash-image` via the configured API workflow.
- Purpose: corrective 3x2 six-variant bush sprite sheet after unit 1 failed sheet geometry; preserve native tile footprint and common anchor.
- Candidate count: 2. This is the final authorised unit; estimated additional cost US$0.04–US$0.08 (Directive 028Y total cap US$0.08–US$0.16).
- Source references: approved Acid Lakes recording crops/frames and in-repo bush references, plus preserved unit-1 candidates for geometry correction.
- Status: authorised and started; raw outputs will be preserved, no key material recorded.
- Result: completed. Raw candidates `Art/2026-07-30 - Directive 028Y/v55-d028y-bush-kit-correction-1.png` and `v55-d028y-bush-kit-correction-2.png` are preserved. No key material recorded.
- Asset gate result: both units failed native-scale inspection. Unit 1 candidates had invalid 4x2/3x3 sheet geometry; unit 2 candidate 2 had 3x2 geometry but read as repeated rectangular foliage blocks at measured scale. No cutout, base, runtime integration or long gate was performed. Directive 028Y generation allowance is exhausted.

## Gate 0 generation proof — 04/08/2026

- Provider/model: Gemini `gemini-3.1-flash-lite-image` (target draft model per Rev 1.3 generation stack; available on first call, no fallback to `gemini-2.5-flash-image` needed).
- Purpose: Gate 0 item 2 — one real image-generation call to prove the Gemini pipeline works, doubling as an early chroma-key datapoint.
- Prompt: "A single stylised teal cartoon bush tuft, chunky 3D-cartoon mobile-game style (Brawl Stars art direction), isolated on a solid pure green #00FF00 chroma-key background. No shadow gradient blending into background, no other objects, no text, no watermark, centred composition."
- Size: 1K. Candidate count: 1.
- Result: completed on the first call. Output `Art/2026-08-04 - Gate 0/gate0-bush-tuft-draft.png` — a chunky teal cartoon bush tuft, thick dark outlines, on solid `#00FF00`; reads as a plausible Brawl-style foliage tuft at a glance. Visually self-QC'd (looked at the image): correct subject, on-model chunky cartoon style, clean flat green background suitable for a chroma-key cutout test, no artefacts, no text/watermark.
- Cost: draft-tier Gemini 3.1 Flash Lite Image = **US$0.0336** (per the Rev 1.3 generation stack rate). No key material recorded.
- Gate 0 generation total: US$0.0336 (within the plan's $0.05 Gate 0 draft cap).
