# Testing Guidelines

## Goals
- Keep tests fast and deterministic.
- Avoid live API calls and network access; mock/stub external requests.
- Avoid writing to real user files or settings; use temp directories.

## Tooling
- Use Bun's built-in test runner: `bun test`.
- Write tests in TypeScript.
- Prefer explicit assertions over snapshot-heavy tests for CLI output.

## Test Layout
```
tests/
├── api/
│   ├── fal.test.ts          # Fal.ai API client tests
│   ├── models.test.ts       # Model configuration tests
│   └── pricing.test.ts      # Pricing client tests
├── cli/
│   └── cli.test.ts          # CLI parsing and command tests
├── studio/
│   └── app.test.tsx         # Studio UI routing and interaction tests
├── utils/
│   ├── config.test.ts       # Config & history management tests
│   └── image.test.ts        # Image utility tests
├── helpers/
│   ├── cli.ts               # CLI test utilities (runCli)
│   ├── env.ts               # Environment setup helpers (temp HOME)
│   ├── fetch.ts             # Fetch mocking utilities (withMockFetch)
│   └── ink.ts               # Ink testing helpers (keyboard input, ANSI stripping)
├── types/
│   └── ink-testing-library.d.ts  # Type declarations for ink-testing-library
└── fixtures/
    └── tiny.png             # Sample image fixture
```
- Name files `*.test.ts` (or `*.test.tsx` for React components) to be picked up by the runner.
- Mirror the source tree so test intent is obvious.

## Test Types
### Unit Tests
- **API logic:** cost estimation fallbacks, aspect-ratio mapping, and model metadata.
- **Config/history:** read/write behavior, defaults, and atomic write logic.
- **Image utils:** pure helpers like filename generation; gate OS-specific functions.

### CLI Integration Tests (Parsing Focus)
- Exercise `falcon --help`, option parsing, and invalid argument handling.
- Spawn the CLI with Bun (e.g., `Bun.spawn` or `Bun.spawnSync`) and assert exit code + output.
- Avoid end-to-end calls that hit the network or rely on API keys.
- Use `runCli()` helper from `tests/helpers/cli.ts` for consistent test execution.

### Studio UI Tests (Ink)
- Use `ink-testing-library` to render components and simulate keyboard input.
- Import helpers from `tests/helpers/ink.ts` for common operations:
  - `KEYS` – key codes for navigation (up, down, enter, escape, etc.)
  - `writeInput()` – send keystrokes to rendered component
  - `waitUntil()` – wait for conditions with timeout
  - `stripAnsi()` – remove ANSI codes for assertions
- Test screen-level routing (home → generate, home → settings → home, etc.).
- Keep UI tests focused on input handling and rendering of basic text.
- Always call `unmount()` after tests to clean up resources.

## Test Helpers

### Environment Setup (`tests/helpers/env.ts`)
Automatically sets up a temporary `HOME` directory for isolated config/history:
```typescript
import "../helpers/env"; // Import at top of test file
// Tests now use temp directory instead of real ~/.falcon
```

### CLI Runner (`tests/helpers/cli.ts`)
Run CLI commands and capture output:
```typescript
import { runCli } from "../helpers/cli";

const result = await runCli(["--help"]);
expect(result.exitCode).toBe(0);
expect(result.stdout).toContain("fal.ai");
```

### Fetch Mocking (`tests/helpers/fetch.ts`)
Stub API calls and inspect requests:
```typescript
import { withMockFetch } from "../helpers/fetch";

const { calls, result } = await withMockFetch(
  async () => Response.json({ images: [] }),
  async () => generate({ prompt: "test", model: "banana" })
);
expect(calls[0].input.toString()).toContain("fal.ai");
```

### Ink Testing (`tests/helpers/ink.ts`)
Utilities for testing Ink components:
```typescript
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

const result = render(<App ... />);
await writeInput(result, KEYS.enter);
await waitUntil(() => stripAnsi(result.lastFrame() ?? "").includes("Prompt"));
result.unmount();
```

## Isolation & Fixtures
- Use temporary directories for config/history and output files.
- Override environment variables (e.g., `HOME`, `FAL_KEY`) within the test process.
- Store fixtures in `tests/fixtures` and keep them small and representative.
- Import `../helpers/env` at the top of CLI/integration tests to ensure isolation.

## Mocking & Stubbing
- Stub `globalThis.fetch` for API-layer tests using `withMockFetch` helper.
- Always restore any mocked globals (like `globalThis.fetch`, timers, or env vars) in a `finally` block or `afterEach` to prevent cross-test leakage, especially when the runner executes files concurrently.
- Mock time-based behavior where needed to keep results deterministic.
- Do not open external apps or spawn long-running processes in tests.

## Platform Considerations
- `resizeImage()` uses `sips` (macOS). Guard tests with `process.platform === "darwin"` and skip otherwise.
- If a utility depends on platform-specific tools or paths, gate the test by platform or mock the dependency so cross-platform runs remain deterministic.

## Running Tests
```bash
bun test                     # Run all tests
bun test --watch            # Run in watch mode for development
bun test tests/api          # Run specific directory
bun test tests/cli/cli.test.ts  # Run specific file
```

## Writing New Tests

### API Tests
Test payload building and response handling:
```typescript
describe("fal api", () => {
  it("builds correct payload for model", async () => {
    setApiKey("test-key");
    const { calls } = await withMockFetch(
      async () => Response.json({ images: [] }),
      async () => generate({ prompt: "test", model: "gpt", aspect: "9:16" })
    );
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.image_size).toBe("1024x1536");
  });
});
```

### CLI Tests
Test command parsing and validation:
```typescript
describe("cli", () => {
  it("validates arguments", async () => {
    const result = await runCli(["--invalid-flag"]);
    expect(result.exitCode).toBe(1);
  });
});
```

Prefer writing outputs to temporary directories in CLI tests (not project or user paths) to keep isolation consistent with config/history guidance.

### Studio Tests
Test screen navigation:
```typescript
describe("studio routing", () => {
  it("navigates to generate screen", async () => {
    const result = render(<App ... />);
    await writeInput(result, KEYS.enter);
    await waitUntil(() => 
      stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:")
    );
    result.unmount();
  });
});
```

Always ensure `unmount()` runs via `try/finally` to prevent resource leaks on failures, and include explicit timeouts with `waitUntil()` to avoid hung tests.
