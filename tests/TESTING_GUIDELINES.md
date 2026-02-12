# Testing Guidelines

## Purpose
This document defines how tests should be written in Falcon so they stay deterministic, isolated, and maintainable as the suite grows.

## Core Principles
- Keep tests deterministic: no live network calls, no random external state.
- Keep tests isolated: no writes to real user files (`~/.falcon`), no leaked globals between tests.
- Keep tests focused: assert behavior, not implementation details.
- Keep tests fast: prefer focused unit/integration tests over broad E2E flows.

## Toolchain
- Runner: Bun (`bun test`)
- Language: TypeScript (`*.test.ts`, `*.test.tsx`)
- UI tests: `ink-testing-library`
- Property testing: `fast-check`

## Current Test Structure
```
tests/
├── api/
│   ├── fal.test.ts
│   ├── models.test.ts
│   └── pricing.test.ts
├── cli/
│   ├── cli.test.ts
│   └── presets.test.ts
├── studio/
│   ├── app.test.tsx
│   ├── edit.test.tsx
│   ├── gallery.test.tsx
│   ├── generate.test.tsx
│   ├── home.test.tsx
│   ├── settings.test.tsx
│   └── spinner.test.tsx
├── utils/
│   ├── config.test.ts
│   ├── constants.test.ts
│   ├── image.test.ts
│   ├── logger.test.ts
│   └── paths.test.ts
├── helpers/
│   ├── cli.ts
│   ├── env.ts
│   ├── fetch.ts
│   ├── ink.ts
│   └── studio-mocks.ts
└── fixtures/
    ├── pricing.json
    └── tiny.png
```

## Test Type Guidance

### API Tests (`tests/api`)
- Verify request payloads, endpoint selection, and response normalization.
- Verify fallback behavior when API estimate/pricing calls fail.
- Always mock `fetch` with `withMockFetch`.

### CLI Tests (`tests/cli`)
- Validate arg parsing, flag validation, and command behavior.
- Use `runCli()` helper for consistent process behavior and timeouts.
- Keep tests in CLI mode (pass at least one arg).
- Avoid real output paths and real user config locations.

### Studio Tests (`tests/studio`)
- Validate keyboard navigation, step transitions, and rendered text.
- Use `KEYS`, `writeInput`, `waitUntil`, and `stripAnsi` from `tests/helpers/ink.ts`.
- Always `unmount()` rendered trees in `finally`.
- Use `withMockFetch` for generation/edit/pricing request flows.

### Utils Tests (`tests/utils`)
- Test data/path/config logic directly with minimal mocking.
- Favor temp directories and explicit fixtures.

## Isolation Rules

### HOME and config/history isolation
- Import `tests/helpers/env.ts` in test files that touch config/history paths.
- `env.ts` sets a temporary `HOME` and refreshes Falcon config paths.

### Network isolation
- Never call live fal.ai endpoints.
- Use `withMockFetch`.

### Global state cleanup
- Restore environment changes in `afterEach` or `finally`.
- Restore env vars changed in `beforeAll`/`beforeEach` using matching `afterAll`/`afterEach` hooks.
- Do not use `test.concurrent` in files that mutate globals (`process.env`, `globalThis.fetch`, module mocks).
- Do not mutate imported shared constants in-place in tests (for example, copy arrays before `.sort()`).

### Artifact cleanup
- Cleanup must be scoped to test-owned directories only.
- Never delete files from project root using broad filename patterns.

## Mocking Policy (Important)

### Default rule
- Use real modules by default.
- Mock only external boundaries (network, OS-open, process spawn, time) unless unit scope requires deeper stubbing.

### Bun `mock.module` behavior
- `mock.module()` is path-based and global for the process lifetime.
- `mock.restore()` does **not** reliably unregister module mocks.
- Because of this, mocking shared modules (for example `src/utils/*`) can leak into unrelated test files.

### Studio-specific pattern
Studio runtime imports testable dependency facades from:
- `src/studio/deps/config.ts`
- `src/studio/deps/image.ts`
- `src/studio/deps/logger.ts`
- `src/studio/deps/paths.ts`

Studio tests should mock these **deps paths**, not `src/utils/*` directly.

Use `tests/helpers/studio-mocks.ts`:

```ts
import { beforeAll } from "bun:test";
import { registerStudioMocks } from "../helpers/studio-mocks";

beforeAll(async () => {
  registerStudioMocks();
  const { GenerateScreen } = await import("../../src/studio/screens/Generate");
});
```

Override defaults when needed:

```ts
registerStudioMocks({
  history: customHistory,
  imageOverrides: { openImage: openImageMock },
  includeConfig: false,
});
```

## Helper Usage

### `tests/helpers/cli.ts`
Use `runCli()` for CLI process execution and normalized timeout/retry behavior:

```ts
import { runCli } from "../helpers/cli";

const result = await runCli(["--help"]);
expect(result.exitCode).toBe(0);
```

`cleanupTestFiles()` should only remove helper-managed output directories.

### `tests/helpers/env.ts`
- Sets temp `HOME`
- Refreshes Falcon path exports after HOME override

### `tests/helpers/fetch.ts`
Use for all fetch interception:

```ts
const { calls, result } = await withMockFetch(
  async (input) => Response.json({ images: [] }),
  async () => runThing(),
);
```

### `tests/helpers/ink.ts`
For Ink interactions:
- `KEYS` navigation constants
- `writeInput()` to simulate keypress/input
- `waitUntil()` for async UI state
- `stripAnsi()` for stable string assertions

### `tests/helpers/studio-mocks.ts`
Shared Studio module mock registration with override hooks.

## Property-Based Test Guidance
- Use property tests for invariants, not simple examples.
- Use conservative `numRuns` for UI tests because each run mounts/unmounts.
- Typical ranges:
  - Small domain: 5-10
  - Medium domain: 10-20
  - Large domain: 20-50

## Platform Notes
- `resizeImage()` prefers `sips` on macOS.
- Guard platform-specific behavior or assert fallback behavior on non-macOS.

## Running Tests
```bash
bun test
bun test --watch
bun test tests/api
bun test tests/studio/generate.test.tsx
```

## Pre-PR Checklist
- Added/updated tests for behavior changes.
- No live network calls.
- No writes to real user config (`~/.falcon`).
- No leaked env/global mutations.
- Studio tests mock `src/studio/deps/*` only.
- New tests pass standalone and in full-suite run.
