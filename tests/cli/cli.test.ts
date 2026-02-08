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
			FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
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

	it("rejects invalid image count", async () => {
		const result = await runCli(["prompt", "--num", "0"], {
			FAL_KEY: "test-key",
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid number of images");
	});

	it("rejects invalid Flux guidance scale", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--guidance-scale", "25"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid guidance scale");
	});

	it("rejects invalid Flux inference steps", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--inference-steps", "2"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid inference steps");
	});

	it("rejects invalid Flux acceleration", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--acceleration", "fast"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid acceleration level");
	});

	it("rejects unsupported aspect ratio for model", async () => {
		const result = await runCli(
			["prompt", "--model", "imagine", "--aspect", "21:9"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Aspect ratio 21:9 is not supported");
	});

	it("handles --last with empty history", async () => {
		const result = await runCli(["--last"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No previous generations found");
	});
});
