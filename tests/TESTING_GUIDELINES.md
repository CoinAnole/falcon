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
│   ├── app.test.tsx         # Studio UI routing tests
│   ├── home.test.tsx        # Home screen navigation and rendering
│   ├── generate.test.tsx    # Generate flow step transitions and seed input
│   ├── edit.test.tsx        # Edit screen flows and operation selection
│   ├── gallery.test.tsx     # Gallery pagination and navigation
│   └── settings.test.tsx    # Settings editing, toggling, and saving
├── utils/
│   ├── config.test.ts       # Config & history management tests
│   └── image.test.ts        # Image utility tests
├── helpers/
│   ├── cli.ts               # CLI test utilities (runCli)
│   ├── env.ts               # Environment setup helpers (temp HOME)
│   ├── fetch.ts             # Fetch mocking utilities (withMockFetch)
│   └── ink.ts               # Ink testing helpers (keyboard input, ANSI stripping, waitUntil)
├── types/
│   └── ink-testing-library.d.ts  # Type declarations for ink-testing-library
└── fixtures/
    ├── pricing.json         # Pricing cache fixture for CLI tests
    └── tiny.png             # Sample image fixture
```
- Name files `*.test.ts` (or `*.test.tsx` for React components) to be picked up by the runner.
- Mirror the source tree so test intent is obvious.

## Test Types
### Unit Tests
- **API logic:** request payload building, error handling, response normalization, and cost estimation fallbacks.
- **Model metadata:** aspect-ratio mapping and model configuration helpers.
- **Config/history:** read/write behavior, defaults, and atomic write logic.
- **Image utils:** pure helpers like filename generation; gate OS-specific functions.

### CLI Integration Tests (Parsing Focus)
- Exercise `falcon --help`, option parsing, and invalid argument handling.
- Spawn the CLI with Bun (e.g., `Bun.spawn` or `Bun.spawnSync`) and assert exit code + output.
- Avoid end-to-end calls that hit the network or rely on API keys.
- Use `runCli()` helper from `tests/helpers/cli.ts` for consistent test execution.
- Cover pricing command behavior and output-format/model validation without network access.

### Studio UI Tests (Ink)
- Use `ink-testing-library` to render components and simulate keyboard input.
- Import helpers from `tests/helpers/ink.ts` for common operations:
  - `KEYS` – key codes for navigation (up, down, enter, escape, tab, backspace)
  - `writeInput()` – send keystrokes to rendered component
  - `waitUntil()` – wait for conditions with timeout
  - `stripAnsi()` – remove ANSI codes for assertions
- Test screen-level routing (home → generate, home → settings → home, etc.).
- Test individual screen behaviors: navigation, input handling, step transitions, and state changes.
- Use property-based testing with `fast-check` to verify behavioral invariants across input ranges.
- Keep UI tests focused on input handling and rendering of basic text.
- Always call `unmount()` after tests to clean up resources (use `try/finally` pattern).
- Mock external dependencies (`../../src/utils/image`, `../../src/utils/config`, etc.) using `mock.module` from `bun:test`.
- Use `withMockFetch` to intercept API calls and prevent live network requests.

> [!WARNING]
> Because `tests/helpers/env.ts` modifies `process.env` and `tests/helpers/fetch.ts` patches `globalThis.fetch`, do **not** use `test.concurrent` within the same file. Parallel execution across different files (default Bun behavior) is safe because each test file runs in its own process/context, but concurrent tests inside a single file will race on these shared globals.

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
  () => Response.json({ images: [] }),  // Sync mock - simpler for static responses
  async () => generate({ prompt: "test", model: "banana" })
);
expect(calls[0].input.toString()).toContain("fal.ai");
```

Both sync and async implementations are supported. Use sync for simple static responses, async when you need conditional logic or async operations:
```typescript
// Async mock for conditional responses
const { calls } = await withMockFetch(
  async (input) => {
    const url = input.toString();
    if (url.includes("/pricing")) {
      return Response.json({ prices: [...] });
    }
    return new Response("not found", { status: 404 });
  },
  async () => { /* test code */ }
);
```

### Ink Testing (`tests/helpers/ink.ts`)
Utilities for testing Ink components:
```typescript
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

const result = render(<App ... />);
try {
  await writeInput(result, KEYS.enter);
  await waitUntil(() => stripAnsi(result.lastFrame() ?? "").includes("Prompt"), { timeoutMs: 3000 });
  expect(stripAnsi(result.lastFrame() ?? "")).toContain("Enter your prompt:");
} finally {
  result.unmount();
}
```

Available key constants in `KEYS`:
- Navigation: `up`, `down`, `left`, `right`
- Actions: `enter`, `escape`, `tab`, `backspace`

Always use `try/finally` to ensure `unmount()` is called even when assertions fail.

## Isolation & Fixtures
- Use temporary directories for config/history and output files.
- Override environment variables (e.g., `HOME`, `FAL_KEY`) within the test process.
- Store fixtures in `tests/fixtures` and keep them small and representative.
- Import `../helpers/env` at the top of CLI/integration tests to ensure isolation.

## Mocking & Stubbing
- Stub `globalThis.fetch` for API-layer tests using `withMockFetch` helper.
- Always restore any mocked globals (like `globalThis.fetch` or timers) and any `process.env` changes (e.g., `FAL_KEY`, `HOME`) in a `finally` block or `afterEach` to prevent cross-test leakage, especially when the runner executes files concurrently.
- Mock time-based behavior where needed to keep results deterministic.
- Do not open external apps or spawn long-running processes in tests.

## Platform Considerations
- `resizeImage()` uses `sips` (macOS). Guard tests with `process.platform === "darwin"` and skip otherwise.
- If a utility depends on platform-specific tools or paths, gate the test by platform or mock the dependency so cross-platform runs remain deterministic.

## Running Tests
```bash
bun test                     # Run all tests
bun run test:watch           # Run in watch mode for development
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
      () => Response.json({ images: [] }),  // Sync mock
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

Prefer writing outputs to temporary directories in CLI tests (not project or user paths) to keep isolation consistent with config/history guidance. Always pass at least one CLI argument so `src/index.ts` stays in CLI mode and does not launch Studio.

When testing pricing flows, use `FALCON_PRICING_FIXTURE` to avoid network calls (see `tests/fixtures/pricing.json`).

### Studio Tests
Test screen navigation and interactions:
```typescript
describe("studio routing", () => {
  it("navigates to generate screen", async () => {
    const result = render(<App ... />);
    try {
      await writeInput(result, KEYS.enter);
      await waitUntil(() => 
        stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
        { timeoutMs: 3000 }
      );
      expect(stripAnsi(result.lastFrame() ?? "")).toContain("Enter your prompt:");
    } finally {
      result.unmount();
    }
  });
});
```

Always ensure `unmount()` runs via `try/finally` to prevent resource leaks on failures, and include explicit timeouts with `waitUntil()` to avoid hung tests.

For screens that import utilities directly, mock them using `mock.module`:
```typescript
import { mock } from "bun:test";

mock.module("../../src/utils/image", () => ({
  downloadImage: mock(() => Promise.resolve()),
  openImage: mock(() => Promise.resolve()),
  generateFilename: mock(() => "test-output.png"),
}));

mock.module("../../src/utils/config", () => ({
  addGeneration: mock(() => Promise.resolve()),
  loadHistory: mock(() => Promise.resolve(testHistory)),
}));
```

Use property-based testing with `fast-check` for behavioral invariants. Keep `numRuns` small for UI tests since each run mounts/unmounts Ink components:
```typescript
import fc from "fast-check";

// Good: Small input space (4 menu items), minimal runs needed
it("property: menu navigation maps to correct screen", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 0, max: 3 }), async (menuIndex) => {
      const onNavigate = mock(() => {});
      const result = render(<Home history={emptyHistory} onNavigate={onNavigate} />);
      try {
        // Navigate to menu item
        for (let i = 0; i < menuIndex; i++) {
          await writeInput(result, KEYS.down);
        }
        await writeInput(result, KEYS.enter);
        
        const expectedScreens = ["generate", "edit", "gallery", "settings"];
        expect(onNavigate).toHaveBeenCalledWith(expectedScreens[menuIndex]);
      } finally {
        result.unmount();
      }
    }),
    { numRuns: 10 }  // 10 runs sufficient for 4 possible values
  );
});

// Good: Larger input space (digit sequences), more runs justified
it("property: seed input builds correct value", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 6 }),
      async (digits) => {
        const result = render(<Generate ... />);
        try {
          // Navigate to seed field and type digits
          // ... navigation code ...
          for (const digit of digits) {
            await writeInput(result, digit.toString());
          }
          const expectedSeed = digits.join("");
          expect(stripAnsi(result.lastFrame() ?? "")).toContain(expectedSeed);
        } finally {
          result.unmount();
        }
      }
    ),
    { numRuns: 20 }  // Reasonable for testing digit sequences
  );
});
```

**Property test sizing guidelines:**
- Small input spaces (booleans, enums with <10 values): Use unit tests instead, or 2-5 runs if property testing
- Medium input spaces (menu indices, step sequences): 10-20 runs
- Large input spaces (strings, digit sequences, combinations): 20-50 runs
- Avoid 100+ runs for UI tests—each run has significant overhead (component mount/unmount)
