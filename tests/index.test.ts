import "./helpers/env";

import { afterAll, describe, expect, it, mock } from "bun:test";
import { cleanupTestFiles, runCli } from "./helpers/cli";

const CLI_TEST_TIMEOUT_MS = 60_000;

describe("entry point mode detection", () => {
	afterAll(() => {
		cleanupTestFiles(true);
	});

	describe("CLI mode detection", () => {
		// Requirements: 9.1 — WHEN process.argv contains arguments beyond the
		// runtime and script path, THE Entry_Point SHALL invoke CLI mode via runCli

		it(
			"invokes CLI mode when arguments are present (--help)",
			async () => {
				const result = await runCli(["--help"]);
				expect(result.exitCode).toBe(0);
				// --help output confirms runCli was invoked and processed the args
				expect(result.stdout).toContain("fal.ai image generation CLI");
			},
			CLI_TEST_TIMEOUT_MS,
		);

		it(
			"invokes CLI mode with a prompt argument",
			async () => {
				// A prompt with no API key should fail via CLI path, proving CLI mode was entered
				const result = await runCli(["a test prompt"], { FAL_KEY: "" });
				expect(result.exitCode).toBe(1);
				expect(result.stderr).toContain("FAL_KEY not found");
			},
			CLI_TEST_TIMEOUT_MS,
		);

		it(
			"invokes CLI mode with flag-only arguments",
			async () => {
				const result = await runCli(["--last"]);
				expect(result.exitCode).toBe(0);
				// --last with no history confirms CLI mode processed the flag
				expect(result.stdout).toContain("No previous generations found");
			},
			CLI_TEST_TIMEOUT_MS,
		);
	});

	describe("Studio mode detection", () => {
		// Requirements: 9.2 — WHEN process.argv contains only the runtime and
		// script path (no additional arguments), THE Entry_Point SHALL launch Studio mode

		it("launches Studio mode when no arguments are given", async () => {
			// Mock all dependencies that index.ts imports so we can track what gets called
			let renderCalled = false;

			mock.module("ink", () => ({
				render: mock(() => {
					renderCalled = true;
					return {
						rerender: () => {},
						waitUntilExit: () => Promise.resolve(),
						unmount: () => {},
						cleanup: () => {},
					};
				}),
			}));

			mock.module("../src/utils/config", () => ({
				loadConfig: mock(() => Promise.resolve({})),
				loadHistory: mock(() =>
					Promise.resolve({
						generations: [],
						totalCost: {},
						lastSessionDate: "",
					}),
				),
				getApiKey: mock(() => {
					throw new Error("no key");
				}),
				saveConfig: mock(() => Promise.resolve()),
			}));

			mock.module("../src/api/fal", () => ({
				setApiKey: mock(() => {}),
			}));

			mock.module("../src/utils/logger", () => ({
				clearLog: mock(() => {}),
				logger: {
					info: () => {},
					debug: () => {},
					warn: () => {},
					error: () => {},
				},
			}));

			mock.module("../src/studio/App", () => ({
				App: () => null,
			}));

			mock.module("../src/cli", () => ({
				runCli: mock(() => Promise.resolve()),
			}));

			// Save and set process.argv to simulate no arguments
			const originalArgv = process.argv;
			process.argv = ["bun", "falcon"];

			try {
				// Dynamic import triggers main() which should detect Studio mode
				await import("../src/index");

				// Give the async main() a moment to complete
				await new Promise((resolve) => setTimeout(resolve, 200));

				expect(renderCalled).toBe(true);
			} finally {
				process.argv = originalArgv;
			}
		});
	});
});
