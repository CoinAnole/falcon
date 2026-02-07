# Testing Guide

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
  api/
  cli/
  utils/
  fixtures/
```
- Name files `*.test.ts` to be picked up by the runner.
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

## Isolation & Fixtures
- Use temporary directories for config/history and output files.
- Override environment variables (e.g., `HOME`, `FAL_KEY`) within the test process.
- Store fixtures in `tests/fixtures` and keep them small and representative.

## Mocking & Stubbing
- Stub `globalThis.fetch` for API-layer tests.
- Mock time-based behavior where needed to keep results deterministic.
- Do not open external apps or spawn long-running processes in tests.

## Platform Considerations
- `resizeImage()` uses `sips` (macOS). Guard tests with `process.platform === "darwin"` and skip otherwise.

## Running Tests
```
bun test
```
Optional: `bun test --watch` for local development.
