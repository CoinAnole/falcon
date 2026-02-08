import "../helpers/env";

import { describe, expect, it } from "bun:test";
import { runCli } from "../helpers/cli";

describe("cli", () => {
	it("prints help", async () => {
		const result = await runCli(["--help"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("fal.ai image generation CLI");
	});

	it("prints pricing hint without refresh", async () => {
		const result = await runCli(["pricing"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Use --refresh");
	});

	it("refreshes pricing cache with --refresh", async () => {
		const result = await runCli(["pricing", "--refresh"], {
			FAL_KEY: "test-key",
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Pricing cache refreshed.");
	});

	it("rejects invalid output format", async () => {
		const result = await runCli(
			["prompt", "--model", "gemini3", "--format", "tiff"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid format");
	});

	it("rejects unknown model", async () => {
		const result = await runCli(["prompt", "--model", "unknown"], {
			FAL_KEY: "test-key",
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Unknown model: unknown");
	});

	it("handles --last with empty history", async () => {
		const result = await runCli(["--last"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No previous generations found");
	});
});
