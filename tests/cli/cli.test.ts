import "../helpers/env";

import { afterAll, it as bunIt, describe, expect } from "bun:test";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Generation } from "../../src/utils/config";
import { cleanupTestFiles, getTestOutputDir, runCli } from "../helpers/cli";
import { getTestHome } from "../helpers/env";

const CLI_TEST_TIMEOUT_MS = 60_000;

function it(
	name: string,
	fn: () => Promise<void> | void,
	timeoutMs = CLI_TEST_TIMEOUT_MS
) {
	return bunIt(name, fn, timeoutMs);
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
		JSON.stringify(history, null, 2)
	);

	return outputPath;
}

describe("cli", () => {
	afterAll(() => {
		cleanupTestFiles(true); // true = completely remove the output directory
	});

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
			{
				FAL_KEY: "test-key",
				FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
			}
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

	it("accepts 512x512 resolution for flux2Flash", async () => {
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
			}
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Flux 2 Flash");
	});

	it("rejects 512x512 resolution for non-Flux models", async () => {
		const result = await runCli(
			["a test prompt", "--resolution", "512x512", "--model", "banana"],
			{
				FAL_KEY: "test-key",
			}
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("only supported for Flux 2 models");
	});

	it("rejects invalid Flux guidance scale", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--guidance-scale", "25"],
			{ FAL_KEY: "test-key" }
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid guidance scale");
	});

	it("rejects invalid Flux inference steps", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--inference-steps", "2"],
			{ FAL_KEY: "test-key" }
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid inference steps");
	});

	it("rejects invalid Flux acceleration", async () => {
		const result = await runCli(
			["prompt", "--model", "flux2", "--acceleration", "fast"],
			{ FAL_KEY: "test-key" }
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid acceleration level");
	});

	it("rejects unsupported aspect ratio for model", async () => {
		const result = await runCli(
			["prompt", "--model", "banana", "--aspect", "20:9"],
			{ FAL_KEY: "test-key" }
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Aspect ratio 20:9 is not supported");
	});

	it("handles --last with empty history", async () => {
		// Clean up any history left by previous tests
		cleanupHistory();
		const result = await runCli(["--last"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No previous generations found");
	});

	describe("--seed", () => {
		it("rejects non-integer seed", async () => {
			const result = await runCli(["a test prompt", "--seed", "abc"], {
				FAL_KEY: "test-key",
			});
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Invalid seed");
		});

		it("accepts valid integer seed", async () => {
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
				30_000 // Longer timeout for this test
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("42");
		}, 60_000);
	});

	describe("--refresh hint", () => {
		it("shows hint without pricing subcommand", async () => {
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

		it("--no-open prevents image opening", async () => {
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
				}
			);
			expect(result.exitCode).toBe(0);
		});

		it("--output saves to specified path", async () => {
			const result = await runCli(
				["a test prompt", "--output", outputFile, "--no-open"],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				}
			);
			expect(result.exitCode).toBe(0);
			expect(existsSync(outputFile)).toBe(true);
		});

		it("--output rejects path traversal", async () => {
			const result = await runCli(
				["a test prompt", "--output", "../escape.png"],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				}
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain(
				"Output path must be within current directory"
			);
		});

		it("--format webp on supported model", async () => {
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
				}
			);
			expect(result.exitCode).toBe(0);
		});
	});

	describe("prompt .json input", () => {
		const fullFlowEnv = {
			FAL_KEY: "test-key",
			FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
			FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
			FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
		};

		it("uses trimmed text from .json file as prompt", async () => {
			const promptPath = join(getTestOutputDir(), "prompt-from-file.json");
			writeFileSync(promptPath, "   prompt loaded from file   \n");

			const result = await runCli(
				[
					promptPath,
					"--no-open",
					"--output",
					join(getTestOutputDir(), "prompt-file-test.png"),
				],
				fullFlowEnv
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("prompt loaded from file");
		});

		it("uses .json prompt file in --edit flow", async () => {
			const promptPath = join(getTestOutputDir(), "prompt-edit-file.json");
			writeFileSync(promptPath, "edit prompt loaded from file");

			const result = await runCli(
				[
					promptPath,
					"--edit",
					"tests/fixtures/tiny.png",
					"--model",
					"banana",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "prompt-file-edit-test.png"),
				],
				fullFlowEnv
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Editing");
			expect(result.stdout).toContain("edit prompt loaded from file");
		});

		it("fails for missing .json prompt file", async () => {
			const missingPromptPath = join(
				getTestOutputDir(),
				"missing-prompt-file.json"
			);
			if (existsSync(missingPromptPath)) {
				unlinkSync(missingPromptPath);
			}

			const result = await runCli([missingPromptPath], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Prompt file not found");
		});

		it("accepts non-JSON text in .json prompt file", async () => {
			const promptPath = join(getTestOutputDir(), "non-json-content.json");
			writeFileSync(promptPath, "this is not valid json {{{{");

			const result = await runCli(
				[
					promptPath,
					"--no-open",
					"--output",
					join(getTestOutputDir(), "non-json-content-test.png"),
				],
				fullFlowEnv
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("this is not valid json");
		});

		it("fails for empty .json prompt file after trimming", async () => {
			const promptPath = join(getTestOutputDir(), "empty-prompt-file.json");
			writeFileSync(promptPath, "\n \t  \n");

			const result = await runCli([promptPath], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain(
				"Prompt file is empty after trimming whitespace"
			);
		});

		it("accepts absolute .json prompt files outside cwd", async () => {
			const outsideDir = mkdtempSync(join(tmpdir(), "falcon-prompt-"));
			const outsidePromptPath = join(outsideDir, "outside-cwd-prompt.json");
			writeFileSync(outsidePromptPath, "outside cwd prompt");

			try {
				const result = await runCli(
					[
						outsidePromptPath,
						"--no-open",
						"--output",
						join(getTestOutputDir(), "outside-cwd-prompt-test.png"),
					],
					fullFlowEnv
				);
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("outside cwd prompt");
			} finally {
				rmSync(outsideDir, { recursive: true, force: true });
			}
		});

		it("does not parse .json input in --up mode", async () => {
			const promptPath = join(getTestOutputDir(), "up-mode-prompt.json");
			writeFileSync(promptPath, "should not be parsed in --up");

			const result = await runCli([promptPath, "--up"], {
				FAL_KEY: "test-key",
			});
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Edit image must be PNG, JPG, or WebP");
		});

		it("does not parse .json input in --vary mode", async () => {
			const promptPath = join(getTestOutputDir(), "vary-mode-prompt.json");
			writeFileSync(promptPath, "\n  \n");
			cleanupHistory();
			setupHistory();

			try {
				const result = await runCli([promptPath, "--vary", "--no-open"], {
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				});
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain(".json");
			} finally {
				cleanupHistory();
			}
		});
	});

	describe("--edit", () => {
		it("fails with nonexistent file", async () => {
			const result = await runCli(
				["a test prompt", "--edit", "nonexistent.png"],
				{ FAL_KEY: "test-key" }
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Edit image not found");
		});

		it("fails with unsupported model", async () => {
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
				}
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("does not support image editing");
		});

		it("edits an existing image with prompt", async () => {
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
				}
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Editing");
		});

		it("supports comma-separated multi-image edit input", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--edit",
					"tests/fixtures/tiny.png,tests/fixtures/tiny.png",
					"--model",
					"banana",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "edit-multi-test.png"),
				],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				}
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Editing 2 images");
		});

		it("fails with invalid comma-separated edit path list", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--edit",
					"tests/fixtures/tiny.png,,tests/fixtures/tiny.png",
					"--model",
					"banana",
				],
				{
					FAL_KEY: "test-key",
				}
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Invalid edit image list");
		});

		it("fails when single-image edit model receives multiple inputs", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--edit",
					"tests/fixtures/tiny.png,tests/fixtures/tiny.png",
					"--model",
					"imagine",
				],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
				}
			);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("supports at most 1 edit input image");
		});
	});

	describe("--transparent", () => {
		it("accepts transparent flag with gpt model", async () => {
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
				}
			);
			expect(result.exitCode).toBe(0);
		});
	});

	describe("--vary", () => {
		it("fails with empty history", async () => {
			// Clean up any history left by previous tests
			cleanupHistory();
			const result = await runCli(["--vary"], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("No previous generation");
		});

		it("generates variations from last generation", async () => {
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

		it("uses custom prompt when provided with --vary", async () => {
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
					}
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
		it("fails with empty history", async () => {
			// Clean up any history left by previous tests
			cleanupHistory();
			const result = await runCli(["--up"], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("No previous generation");
		});

		it("upscales last generation", async () => {
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

		it("upscales from provided path", async () => {
			const result = await runCli(
				["tests/fixtures/tiny.png", "--up", "--no-open"],
				{
					FAL_KEY: "test-key",
					FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
					FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
					FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
				}
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Upscaling");
		}, 60_000);
	});

	describe("--rmbg", () => {
		it("fails with empty history", async () => {
			// Clean up any history left by previous tests
			cleanupHistory();
			const result = await runCli(["--rmbg"], { FAL_KEY: "test-key" });
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("No previous generation");
		});

		it("removes background from last generation", async () => {
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
					10_000 // Extended timeout for background removal
				);
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("Removing background");
			} finally {
				// Clean up history to avoid polluting other tests
				cleanupHistory();
			}
		}, 60_000);
	});

	describe("missing API key", () => {
		it("errors when no API key is set", async () => {
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

		it("--cover sets 2:3 aspect", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--cover",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "cover-test.png"),
				],
				fullFlowEnv
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("2:3");
		});

		it("--story sets 9:16 aspect", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--story",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "story-test.png"),
				],
				fullFlowEnv
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("9:16");
		});

		it("--square sets 1:1 aspect", async () => {
			const result = await runCli(
				[
					"a test prompt",
					"--square",
					"--no-open",
					"--output",
					join(getTestOutputDir(), "square-test.png"),
				],
				fullFlowEnv
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("1:1");
		});
	});
});
