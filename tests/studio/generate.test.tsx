import { describe, expect, it, mock } from "bun:test";
import fc from "fast-check";
import { render } from "ink-testing-library";
import type { FalconConfig } from "../../src/utils/config";
import { withMockFetch } from "../helpers/fetch";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

// Mock modules before importing the component
mock.module("../../src/utils/image", () => ({
	downloadImage: mock(() => Promise.resolve()),
	openImage: mock(() => Promise.resolve()),
	generateFilename: mock(() => "test-output.png"),
	getImageDimensions: mock(() =>
		Promise.resolve({ width: 1024, height: 1024 }),
	),
	getFileSize: mock(() => Promise.resolve("1.2 MB")),
	imageToDataUrl: mock(() => Promise.resolve("data:image/png;base64,dGVzdA==")),
}));

mock.module("../../src/utils/config", () => ({
	addGeneration: mock(() => Promise.resolve()),
	generateId: mock(() => "test-id"),
	loadConfig: mock(() =>
		Promise.resolve({
			defaultModel: "banana",
			defaultAspect: "1:1",
			defaultResolution: "2K",
			openAfterGenerate: false,
			upscaler: "clarity",
			backgroundRemover: "rmbg",
			promptExpansion: false,
		}),
	),
	loadHistory: mock(() =>
		Promise.resolve({
			generations: [],
			totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
			lastSessionDate: new Date().toISOString().split("T")[0],
		}),
	),
	FALCON_DIR: "/tmp/falcon-test",
}));

mock.module("../../src/utils/paths", () => ({
	validateOutputPath: mock((p: string) => p),
	validateImagePath: mock(() => {}),
	isPathWithinCwd: mock(() => true),
}));

mock.module("../../src/utils/logger", () => ({
	logger: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		errorWithStack: () => {},
	},
}));

// Set FAL_KEY so getApiKey() doesn't throw during generation
process.env.FAL_KEY = "test-key-for-generate-tests";

const { GenerateScreen } = await import("../../src/studio/screens/Generate");

const baseConfig: FalconConfig = {
	defaultModel: "banana",
	defaultAspect: "1:1",
	defaultResolution: "2K",
	openAfterGenerate: false,
	upscaler: "clarity",
	backgroundRemover: "rmbg",
	promptExpansion: false,
};

const mockFetchImpl = (input: RequestInfo | URL) => {
	const url = input.toString();
	if (url.includes("/pricing")) {
		return Response.json({
			total_cost: 0.15,
			currency: "USD",
		});
	}
	if (url.includes("/models/pricing")) {
		return Response.json({
			prices: [
				{
					endpoint_id: "fal-ai/nano-banana-pro",
					unit_price: 0.15,
					unit: "image",
					currency: "USD",
				},
			],
		});
	}
	// Default: generation response
	return Response.json({
		images: [{ url: "https://example.com/image.png" }],
		seed: 42,
	});
};

describe("generate screen", () => {
	it("renders prompt input with 'Enter your prompt:'", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Enter your prompt:");
		} finally {
			result.unmount();
		}
	});

	it("prompt submission transitions to preset step", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 },
			);
			// Type a prompt and submit
			await writeInput(result, "a beautiful sunset");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Quick presets");
			expect(output).toContain("Square");
			expect(output).toContain("Landscape");
		} finally {
			result.unmount();
		}
	});

	it("preset selection transitions to confirm step", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, "a cat");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 },
			);
			// Select first preset (Square 1:1)
			await withMockFetch(mockFetchImpl, async () => {
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 },
				);
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Ready to generate");
			expect(output).toContain("1:1");
		} finally {
			result.unmount();
		}
	});

	it("tab on preset step transitions to model selection", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, "a dog");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 },
			);
			// Press tab to go to model selection
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select model"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select model");
			expect(output).toContain("Nano Banana Pro");
		} finally {
			result.unmount();
		}
	});

	it("escape on prompt step invokes onBack", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.escape);
			expect(onBack).toHaveBeenCalledTimes(1);
		} finally {
			result.unmount();
		}
	});

	it("'y' on confirm step triggers generation (fetch called)", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});

		// Wrap the entire test in withMockFetch so pricing + generation calls are intercepted
		const { calls } = await withMockFetch(mockFetchImpl, async () => {
			const result = render(
				<GenerateScreen
					config={baseConfig}
					onBack={onBack}
					onComplete={onComplete}
					onError={onError}
				/>,
			);
			try {
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
					{ timeoutMs: 3000 },
				);
				await writeInput(result, "a mountain");
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
					{ timeoutMs: 3000 },
				);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 },
				);
				// Press 'y' to confirm generation
				await writeInput(result, "y");
				// Wait for generating/downloading/done step
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return (
							frame.includes("Generating") ||
							frame.includes("Downloading") ||
							frame.includes("Image ready")
						);
					},
					{ timeoutMs: 5000 },
				);
			} finally {
				result.unmount();
			}
		});
		// Pricing + generation calls should have been made
		expect(calls.length).toBeGreaterThan(0);
	});

	// Feature: studio-ui-tests, Property 2: Generate escape goes back one step
	// **Validates: Requirements 2.5**
	it("property: escape goes back one step", async () => {
		// Steps after prompt that we can reach and escape from
		// We test: preset -> prompt, model -> preset, confirm -> preset
		const stepSequences = [
			{
				name: "preset",
				setup: async (r: ReturnType<typeof render>) => {
					await writeInput(r, "test prompt");
					await writeInput(r, KEYS.enter);
					await waitUntil(
						() => stripAnsi(r.lastFrame() ?? "").includes("Quick presets"),
						{ timeoutMs: 3000 },
					);
				},
				expectedAfterEscape: "Enter your prompt:",
			},
			{
				name: "model",
				setup: async (r: ReturnType<typeof render>) => {
					await writeInput(r, "test prompt");
					await writeInput(r, KEYS.enter);
					await waitUntil(
						() => stripAnsi(r.lastFrame() ?? "").includes("Quick presets"),
						{ timeoutMs: 3000 },
					);
					await writeInput(r, KEYS.tab);
					await waitUntil(
						() => stripAnsi(r.lastFrame() ?? "").includes("Select model"),
						{ timeoutMs: 3000 },
					);
				},
				expectedAfterEscape: "Quick presets",
			},
		];

		await fc.assert(
			fc.asyncProperty(fc.constantFrom(...stepSequences), async (stepSeq) => {
				const onBack = mock(() => {});
				const onComplete = mock(() => {});
				const onError = mock(() => {});
				const result = render(
					<GenerateScreen
						config={baseConfig}
						onBack={onBack}
						onComplete={onComplete}
						onError={onError}
					/>,
				);
				try {
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes(
								"Enter your prompt:",
							),
						{ timeoutMs: 3000 },
					);
					await stepSeq.setup(result);
					await writeInput(result, KEYS.escape);
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes(
								stepSeq.expectedAfterEscape,
							),
						{ timeoutMs: 3000 },
					);
					const output = stripAnsi(result.lastFrame() ?? "");
					expect(output).toContain(stepSeq.expectedAfterEscape);
				} finally {
					result.unmount();
				}
			}),
			{ numRuns: 100 },
		);
	}, 120_000);

	// Feature: studio-ui-tests, Property 3: Generate confirm displays all fields
	// **Validates: Requirements 2.7**
	it("property: confirm step displays all fields", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc
					.string({ minLength: 1, maxLength: 60 })
					.filter((s) => s.trim().length > 0),
				async (promptText) => {
					const onBack = mock(() => {});
					const onComplete = mock(() => {});
					const onError = mock(() => {});
					const result = render(
						<GenerateScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
						/>,
					);
					try {
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Enter your prompt:",
								),
							{ timeoutMs: 3000 },
						);
						// Type prompt and submit
						await writeInput(result, promptText);
						await writeInput(result, KEYS.enter);
						// Check if we transitioned (prompt must be non-empty after trim)
						const trimmed = promptText.trim();
						if (!trimmed) return; // skip empty prompts

						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
							{ timeoutMs: 3000 },
						);
						// Select first preset (Square) to go to confirm
						await withMockFetch(mockFetchImpl, async () => {
							await writeInput(result, KEYS.enter);
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										"Ready to generate",
									),
								{ timeoutMs: 3000 },
							);
						});
						const output = stripAnsi(result.lastFrame() ?? "");
						// Should display prompt (possibly truncated at 50 chars)
						const expectedPrompt =
							trimmed.length > 50 ? trimmed.slice(0, 50) : trimmed;
						expect(output).toContain(expectedPrompt);
						// Should display model name
						expect(output).toContain("Nano Banana Pro");
						// Should display aspect ratio
						expect(output).toContain("1:1");
						// Should display seed field
						expect(output).toContain("Seed");
					} finally {
						result.unmount();
					}
				},
			),
			{ numRuns: 100 },
		);
	}, 120_000);

	// Feature: studio-ui-tests, Property 4: Seed digit input builds seed value
	// **Validates: Requirements 2.8**
	it("property: seed digit input builds seed value", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.integer({ min: 0, max: 9 }), {
					minLength: 1,
					maxLength: 5,
				}),
				async (digits) => {
					const onBack = mock(() => {});
					const onComplete = mock(() => {});
					const onError = mock(() => {});
					const result = render(
						<GenerateScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
						/>,
					);
					try {
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Enter your prompt:",
								),
							{ timeoutMs: 3000 },
						);
						// Navigate to confirm step
						await writeInput(result, "test seed");
						await writeInput(result, KEYS.enter);
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
							{ timeoutMs: 3000 },
						);
						await withMockFetch(mockFetchImpl, async () => {
							await writeInput(result, KEYS.enter);
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										"Ready to generate",
									),
								{ timeoutMs: 3000 },
							);
						});
						// Navigate to seed field. For banana model (supportsResolution=true),
						// fields are: model(0), aspect(1), resolution(2), seed(3)
						// Navigate down to seed
						await writeInput(result, KEYS.down); // aspect
						await writeInput(result, KEYS.down); // resolution
						await writeInput(result, KEYS.down); // seed
						// Enter editing mode for seed
						await writeInput(result, KEYS.enter);
						// Type each digit
						for (const digit of digits) {
							await writeInput(result, String(digit));
						}
						// The expected seed value is the digits concatenated as a number
						const expectedSeed = Number(digits.join(""));
						await waitUntil(
							() => {
								const frame = stripAnsi(result.lastFrame() ?? "");
								return frame.includes(String(expectedSeed));
							},
							{ timeoutMs: 3000 },
						);
						const output = stripAnsi(result.lastFrame() ?? "");
						expect(output).toContain(String(expectedSeed));
					} finally {
						result.unmount();
					}
				},
			),
			{ numRuns: 100 },
		);
	}, 120_000);
});
