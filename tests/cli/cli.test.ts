import "../helpers/env";

import { afterAll, describe, expect, it } from "bun:test";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Generation } from "../../src/utils/config";
import { cleanupTestFiles, getTestOutputDir, runCli } from "../helpers/cli";
import { getTestHome } from "../helpers/env";

const CLI_TEST_TIMEOUT_MS = 60_000;

function itCli(
	name: string,
	fn: () => Promise<void> | void,
	timeoutMs = CLI_TEST_TIMEOUT_MS,
) {
	return it(name, fn, timeoutMs);
}

/**
 * Clean up all history-related test files (both history.json and output images)
 */
function cleanupHistory(): void {
	const home = getTestHome();
	const falconDir = join(home, ".falcon");
	const historyPath = join(falconDir, "history.json");
	const outputPath = join(falconDir, "test-output.png");

	try {
		if (existsSync(historyPath)) {
			unlinkSync(historyPath);
		}
	} catch {
		// Ignore cleanup errors
	}
	try {
		if (existsSync(outputPath)) {
			unlinkSync(outputPath);
		}
	} catch {
		// Ignore cleanup errors
	}
}

function setupHistory(overrides?: Partial<Generation>): string {
	const home = getTestHome();
	const falconDir = join(home, ".falcon");
	mkdirSync(falconDir, { recursive: true });

	// Copy tiny.png to a known location for output reference
	const outputPath = join(falconDir, "test-output.png");
	copyFileSync("tests/fixtures/tiny.png", outputPath);

	const history = {
		generations: [
			{
				id: "test-gen-id",
				prompt: "a test image",
				model: "banana",
				aspect: "1:1",
				resolution: "2K",
				output: outputPath,
				cost: 0.15,
				timestamp: new Date().toISOString(),
				...overrides,
			},
		],
		totalCost: { USD: { session: 0.15, today: 0.15, allTime: 0.15 } },
		lastSessionDate: new Date().toISOString().split("T")[0],
	};

	writeFileSync(
		join(falconDir, "history.json"),
		JSON.stringify(history, null, 2),
	);

	return outputPath;
}

describe("cli", () => {
	afterAll(() => {
		cleanupTestFiles(true); // true = completely remove the output directory
	});

	itCli("prints help", async () => {
		const result = await runCli(["--help"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("fal.ai image generation CLI");
	});

	itCli("prints pricing hint without refresh", async () => {
		const result = await runCli(["pricing"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Use --refresh");
	});

	itCli("refreshes pricing cache with --refresh", async () => {
		const result = await runCli(["pricing", "--refresh"], {
			FAL_KEY: "test-key",
			FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Pricing cache refreshed.");
	});

	itCli("rejects invalid output format", async () => {
		const result = await runCli(
			["prompt", "--model", "gemini3", "--format", "tiff"],
			{
				FAL_KEY: "test-key",
				FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
			},
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid format");
	});

	itCli("rejects unknown model", async () => {
		const result = await runCli(["prompt", "--model", "unknown"], {
			FAL_KEY: "test-key",
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Unknown model: unknown");
	});

	itCli("rejects invalid image count", async () => {
		const result = await runCli(["prompt", "--num", "0"], {
			FAL_KEY: "test-key",
		});
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid number of images");
	});

	itCli("accepts 512x512 resolution for flux2Flash", async () => {
		const outputFile = join(getTestOutputDir(), "resolution-512-test.png");
		const result = await runCli(
			[
				"a test prompt",
				"--resolution",
				"512x512",
				"--model",
				"flux2Flash",
				"--no-open",
				"--output",
				outputFile,
			],
			{
				FAL_KEY: "test-key",
				FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
				FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
				FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
			},
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Flux 2 Flash");
	});

	itCli("rejects 512x512 resolution for non-Flux models", async () => {
		const result = await runCli(
			[
				"a test prompt",
				"--resolution",
				"512x512",
				"--model",
				"banana",
			],
			{
				FAL_KEY: "test-key",
			},
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("only supported for Flux 2 models");
	});

	itCli("rejects invalid Flux guidance scale", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--guidance-scale", "25"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid guidance scale");
	});

	itCli("rejects invalid Flux inference steps", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--inference-steps", "2"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid inference steps");
	});

	itCli("rejects invalid Flux acceleration", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--acceleration", "fast"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid acceleration level");
	});

	itCli("rejects unsupported aspect ratio for model", async () => {
		const result = await runCli(
			["prompt", "--model", "banana", "--aspect", "20:9"],
			{ FAL_KEY: "test-key" },
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Aspect ratio 20:9 is not supported");
	});

	itCli("handles --last with empty history", async () => {
		// Clean up any history left by previous tests
		cleanupHistory();
		const result = await runCli(["--last"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No previous generations found");
	});

	describe("--seed", () => {
		itCli("rejects non-integer seed", async () => {
			const result = await runCli(["a test prompt", "--seed", "abc"], {
				FAL_KEY: "test-key",
			});
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Invalid seed");
		});

		itCli(
			"accepts valid integer seed",
			async () => {
				const result = await runCli(
					[
						"a test prompt",
						"--seed",
						"42",
						"--no-open",
						"--output",
						join(getTestOutputDir(), "seed-test.png"),
					],
					{
						FAL_KEY: "test-key",
						FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
						FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
						FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
					},
					30000, // Longer timeout for this test
				);
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("42");
			},
			60000,
		);
	});

	describe("--refresh hint", () => {
		itCli("shows hint without pricing subcommand", async () => {
			const result = await runCli(["--refresh"]);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Use 'falcon pricing --refresh'");
		});
	});

	describe("output control", () => {
		const outputFile = join(getTestOutputDir(), "test-out.png");

		afterAll(() => {
			if (existsSync(outputFile)) {
				unlinkSync(outputFile);
			}
		});

		itCli("--no-open prevents image opening", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "no-open-test.png"),
				],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				},
			);
			expect(result.exitCode).toBe(0);
		});

		itCli("--output saves to specified path", async () => {
			const result = await runCli(
				["a test prompt", "--output", outputFile, "--no-open"],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				},
			);
			expect(result.exitCode).toBe(0);
			expect(existsSync(outputFile)).toBe(true);
		});

		itCli("--output rejects path traversal", async () => {
			const result = await runCli(
				["a test prompt", "--output", "../escape.png"],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				},
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain(
				"Output path must be within current directory",
			);
		});

		itCli("--format webp on supported model", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--format",
					"webp",
					"--model",
					"gemini3",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "webp-test.png"),
				],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				},
			);
			expect(result.exitCode).toBe(0);
		});
	});

	describe("--edit", () => {
		itCli("fails with nonexistent file", async () => {
			const result = await runCli(
				["a test prompt", "--edit", "nonexistent.png"],
				{ FAL_KEY: "test-key" },
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Edit image not found");
		});

		itCli("fails with unsupported model", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--edit",
					"tests/fixtures/tiny.png",
					"--model",
					"clarity",
				],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
				},
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("does not support image editing");
		});

		itCli("edits an existing image with prompt", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--edit",
					"tests/fixtures/tiny.png",
					"--model",
					"banana",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "edit-test.png"),
				],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				},
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Editing");
		});
	});

	describe("--transparent", () => {
		itCli("accepts transparent flag with gpt model", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--transparent",
					"--model",
					"gpt",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "transparent-test.png"),
				],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				},
			);
			expect(result.exitCode).toBe(0);
		});
	});

	describe("--vary", () => {
		itCli("fails with empty history", async () => {
			// Clean up any history left by previous tests
			cleanupHistory();
			const result = await runCli(["--vary"], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("No previous generation");
		});

		itCli("generates variations from last generation", async () => {
			cleanupHistory();
			setupHistory();
			try {
				const result = await runCli(["--vary", "--no-open"], {
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				});
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("Generating variations");
			} finally {
				// Clean up history to avoid polluting other tests
				cleanupHistory();
			}
		});

		itCli("uses custom prompt when provided with --vary", async () => {
			cleanupHistory();
			setupHistory();
			try {
				const result = await runCli(
					["my custom variation prompt", "--vary", "--no-open"],
					{
						FAL_KEY: "test-key",
						FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
						FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
						FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
					},
				);
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("my custom variation prompt");
			} finally {
				// Clean up history to avoid polluting other tests
				cleanupHistory();
			}
		});
	});

	describe("--up", () => {
		itCli("fails with empty history", async () => {
			// Clean up any history left by previous tests
			cleanupHistory();
			const result = await runCli(["--up"], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("No previous generation");
		});

		itCli("upscales last generation", async () => {
			cleanupHistory();
			setupHistory();
			try {
				const result = await runCli(["--up", "--no-open"], {
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				});
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("Upscaling");
			} finally {
				// Clean up history to avoid polluting other tests
				cleanupHistory();
			}
		});

		itCli(
			"upscales from provided path",
			async () => {
				const result = await runCli(
					["tests/fixtures/tiny.png", "--up", "--no-open"],
					{
						FAL_KEY: "test-key",
						FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
						FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
						FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
					},
				);
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("Upscaling");
			},
			60000,
		);
	});

	describe("--rmbg", () => {
		itCli("fails with empty history", async () => {
			// Clean up any history left by previous tests
			cleanupHistory();
			const result = await runCli(["--rmbg"], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("No previous generation");
		});

		itCli(
			"removes background from last generation",
			async () => {
				cleanupHistory();
				setupHistory();
				try {
					const result = await runCli(
						["--rmbg", "--no-open"],
						{
							FAL_KEY: "test-key",
							FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
							FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
							FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
						},
						10000, // Extended timeout for background removal
					);
					expect(result.exitCode).toBe(0);
					expect(result.stdout).toContain("Removing background");
				} finally {
					// Clean up history to avoid polluting other tests
					cleanupHistory();
				}
			},
			60000,
		);
	});

	describe("missing API key", () => {
		itCli("errors when no API key is set", async () => {
			const result = await runCli(["a test prompt"], { FAL_KEY: "" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("FAL_KEY not found");
		});
	});

	describe("preset flags", () => {
		const fullFlowEnv = {
			FAL_KEY: "test-key",
			FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
			FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
			FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
		};

		itCli("--cover sets 2:3 aspect", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--cover",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "cover-test.png"),
				],
				fullFlowEnv,
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("2:3");
		});

		itCli("--story sets 9:16 aspect", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--story",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "story-test.png"),
				],
				fullFlowEnv,
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("9:16");
		});

		itCli("--square sets 1:1 aspect", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--square",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "square-test.png"),
				],
				fullFlowEnv,
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("1:1");
		});
	});
});
