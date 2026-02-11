import "./helpers/env";

import { afterAll, describe, expect, it } from "bun:test";
import { cleanupTestFiles, runCli } from "./helpers/cli";

const CLI_TEST_TIMEOUT_MS = 60_000;

describe("entry point mode detection", () => {
	afterAll(() => {
		// Keep the shared output directory in place for later test files.
		cleanupTestFiles();
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
			const result = await runCli([], { FALCON_TEST_SKIP_STUDIO: "1" });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("[falcon:index] studio-mode");
		});
	});
});
