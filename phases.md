Here's where we stand and what's missing for full E2E coverage:

## Current State: 85/86 passing (1 flaky timeout in edit.test.tsx)

## Gaps

**Untested source modules:**

- `src/utils/paths.ts` — no test file at all. `validateOutputPath`, `normalizeOutputPath`, `buildIndexedOutputPath`, `isPathWithinCwd`, and `validateImagePath` are all uncovered.
- `src/utils/logger.ts` — no test file. `logger.debug/info/warn/error`, `errorWithStack`, `clearLog`, `getLogPath`, `isEnabled`, and the sanitization logic are untested.
- `src/utils/constants.ts` — `isValidUpscaleFactor` is untested (trivial, but still a gap).
- `src/index.ts` — the entry point's mode detection (CLI vs Studio) and `launchStudio()` re-render logic have no integration test.

**Gaps in existing test files:**

`tests/api/fal.test.ts`:

- No test for HTTP error responses (non-200 status codes) on `generate`, `upscale`, or `removeBackground`
- No test for `getApiKey()` fallback chain (env → config → throw)
- No test for Banana/Gemini/Gemini3/Imagine model payload building (only GPT and Flux2 are tested)
- No test for `outputFormat` on models that support it vs. models that don't
- No test for `numImages` parameter
- No test for `resolution` parameter on models that support it
- Missing `removeBackground` with `bria` model

`tests/api/models.test.ts`:

- Only tests a few `aspectToGptSize` mappings — portrait variants (`2:3`, `4:5`, `3:4`) and the default case aren't explicitly verified
- `aspectToFlux2Size` only tests 2 of 10+ mappings
- `estimateCost` only tests `banana` — no coverage for `gpt`, `gemini`, `flux2`, `flux2Flash`, `flux2Turbo`, `imagine`, `clarity`, `crystal`, `rmbg`, `bria`, or the unknown model fallback
- `GENERATION_MODELS` and `UTILITY_MODELS` arrays aren't validated

`tests/cli/cli.test.ts`:

- No test for `--vary` (variations)
- No test for `--up` (upscale) with a path argument or from last generation
- No test for `--rmbg` (background removal)
- No test for `--seed`
- No test for preset flags (`--cover`, `--square`, `--landscape`, `--portrait`, `--story`, `--reel`, `--feed`, `--og`, `--wallpaper`, `--wide`, `--ultra`)
- No test for `--edit` with a file
- No test for `--transparent`
- No test for `--no-open`
- No test for `--output` path validation
- No test for `--format` on a model that supports it (only tests rejection)
- No test for `--refresh` without `pricing` subcommand (the hint message)
- No test for missing API key error

`tests/utils/config.test.ts`:

- No test for `generateId()` uniqueness
- No test for corrupted config file handling (parse error fallback)
- No test for corrupted history file handling
- No test for legacy `totalCost` format migration (the flat `{session, today, allTime}` → per-currency conversion)
- No test for multi-currency cost tracking

`tests/utils/image.test.ts`:

- No test for `downloadImage`
- No test for `resizeImage` (even a mocked/skipped version)
- No test for `openImage`
- No test for `getImageDimensions`
- No test for `getFileSize`
- JPEG and WebP MIME type detection in `imageToDataUrl` untested

**Studio test gaps:**

`tests/studio/app.test.tsx`:

- No test for the `q` key quitting from home
- No test for error display (the 5-second error banner)
- No test for cost footer rendering with actual cost data
- No test for edit screen routing with `skipToOperation`/`initialOperation`

`tests/studio/generate.test.tsx`:

- No test for the "done" step post-generation menu (Edit/Variations/Upscale/Remove Background/Regenerate/New Prompt/Done)
- No test for model selection step navigation and selection
- No test for aspect ratio grid navigation (←→↑↓)
- No test for resolution selection step
- No test for confirm field inline editing (model/aspect/resolution cycling)
- No test for `n` on confirm step (cancel)

`tests/studio/edit.test.tsx`:

- No test for the custom path input flow (typing a path, submitting)
- No test for the prompt input step (edit mode)
- No test for the scale step (↑↓ to adjust factor)
- No test for the "done" step (enter to continue)
- No test for the confirm step `y`/`n` interaction
- No test for seed input on confirm step
- 1 flaky test (`selecting Upscale operation transitions to scale step`) — likely a timing issue

`tests/studio/gallery.test.tsx`:

- No test for `enter` opening an image (the `openImage` call)
- No test for cross-page navigation via up/down arrows (scrolling past page boundary)

`tests/studio/settings.test.tsx`:

- No test for text input submission (typing an API key and pressing enter)
- No test for Default Model cycling (verifying it shows model names, not keys)
- No test for Default Aspect and Default Resolution cycling

**Missing test infrastructure:**

- No test for the `Spinner` component
- No type/fixture for `ink-testing-library` beyond the existing `.d.ts`

## Priority Recommendations

1. Add `tests/utils/paths.test.ts` — pure functions, easy wins, security-relevant (path traversal prevention)
2. Add `tests/utils/logger.test.ts` — covers sanitization of API keys in logs
3. Expand `tests/cli/cli.test.ts` with preset flags, `--vary`, `--up`, `--rmbg`, and `--seed` (these are the core CLI E2E flows)
4. Fix the flaky edit upscale test (likely needs a longer timeout or an extra `waitForRender`)
5. Fill the `fal.test.ts` gaps for remaining model payloads and error handling
6. Add the "done" step tests in generate and edit screens — these are real user flows that are completely untested

---

Yeah, we've got a lot left to do. Split this up into multiple phases, and we'll create then implement Kiro specs for each phase separately. This is way too big for just one spec.

---

Good call. Here's how I'd break it down into manageable phases, ordered by impact and dependency:

**Phase 1: Pure Utility Tests** `paths.ts`, `logger.ts`, `constants.ts` — zero mocking needed, pure functions, fast to write. `paths.ts` is security-relevant (path traversal). Also fills the `models.test.ts` gaps (more `aspectToGptSize`/`aspectToFlux2Size` mappings, `estimateCost` for all models).

**Phase 2: API Layer Tests** Expand `fal.test.ts` — remaining model payloads (Banana, Gemini, Gemini3, Imagine), HTTP error handling, `getApiKey` fallback chain, `outputFormat`, `numImages`, `resolution`. Expand `pricing.test.ts` if needed. These are the core API contract tests.

**Phase 3: CLI E2E Tests** Preset flags (`--cover`, `--story`, etc.), `--vary`, `--up`, `--rmbg`, `--seed`, `--edit`, `--transparent`, `--output` validation, `--format` on supported models, missing API key error. These spawn real CLI processes and test end-to-end flows.

**Phase 4: Studio UI Tests** Generate screen done/post-action menu, model/aspect/resolution selection steps, confirm field editing. Edit screen custom path flow, prompt input, scale adjustment, done step, seed input. Gallery enter-to-open. Fix the flaky edit upscale test. App-level `q` quit, error banner, cost footer.

**Phase 5: Config & Integration Tests** `config.test.ts` gaps — corrupted files, legacy migration, multi-currency, `generateId`. `image.test.ts` gaps — `downloadImage`, MIME types. Entry point mode detection. `Spinner` component.
