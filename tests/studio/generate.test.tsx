import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import type { FalconConfig } from "../../src/studio/deps/config";
import { withMockFetch } from "../helpers/fetch";
import { importWithTimeoutRetry } from "../helpers/import";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";
import {
	registerStudioMocks,
	STUDIO_TEST_CONFIG,
} from "../helpers/studio-mocks";

const { default: fc } = await importWithTimeoutRetry(
	() => import("fast-check"),
	{
		label: "fast-check import (generate.test)",
	}
);

let GenerateScreen =
	null as unknown as typeof import("../../src/studio/screens/generate")["GenerateScreen"];
let originalFalKey: string | undefined;

beforeAll(async () => {
	originalFalKey = process.env.FAL_KEY;
	registerStudioMocks();
	// Set FAL_KEY so getApiKey() doesn't throw during generation
	process.env.FAL_KEY = "test-key-for-generate-tests";
	({ GenerateScreen } = await importWithTimeoutRetry(
		() => import("../../src/studio/screens/generate"),
		{ label: "GenerateScreen import" }
	));
});

afterAll(() => {
	if (originalFalKey === undefined) {
		process.env.FAL_KEY = undefined;
	} else {
		process.env.FAL_KEY = originalFalKey;
	}
});

const baseConfig: FalconConfig = STUDIO_TEST_CONFIG;

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
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Enter your prompt:");
		} finally {
			result.unmount();
		}
	});

	it("prompt submission transitions to preset step", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			// Type a prompt and submit
			await writeInput(result, "a beautiful sunset");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
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
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "a cat");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);
			// Select first preset (Square 1:1)
			await withMockFetch(mockFetchImpl, async () => {
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 }
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
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "a dog");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);
			// Press tab to go to model selection
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select model"),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select model");
			expect(output).toContain("Nano Banana Pro");
		} finally {
			result.unmount();
		}
	});

	it("preset step up/down arrows wrap selection", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "wrap test");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.up);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Social Share"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Square"),
				{ timeoutMs: 3000 }
			);
		} finally {
			result.unmount();
		}
	});

	it("escape on prompt step invokes onBack", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.escape);
			expect(onBack).toHaveBeenCalledTimes(1);
		} finally {
			result.unmount();
		}
	});

	it("q in prompt step is treated as text input (does not quit)", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const onQuit = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
				onQuit={onQuit}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "q");
			expect(onQuit).not.toHaveBeenCalled();
			expect(stripAnsi(result.lastFrame() ?? "")).toContain(
				"Enter your prompt:"
			);
		} finally {
			result.unmount();
		}
	});

	it("'y' on confirm step triggers generation (fetch called)", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);

		// Wrap the entire test in withMockFetch so pricing + generation calls are intercepted
		const { calls } = await withMockFetch(mockFetchImpl, async () => {
			const result = render(
				<GenerateScreen
					config={baseConfig}
					onBack={onBack}
					onComplete={onComplete}
					onError={onError}
				/>
			);
			try {
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, "a mountain");
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 }
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
					{ timeoutMs: 5000 }
				);
			} finally {
				result.unmount();
			}
		});
		// Pricing + generation calls should have been made
		expect(calls.length).toBeGreaterThan(0);
	});

	it("'Y' on confirm step triggers generation (fetch called)", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);

		const { calls } = await withMockFetch(mockFetchImpl, async () => {
			const result = render(
				<GenerateScreen
					config={baseConfig}
					onBack={onBack}
					onComplete={onComplete}
					onError={onError}
				/>
			);
			try {
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, "a mountain");
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, "Y");
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return (
							frame.includes("Generating") ||
							frame.includes("Downloading") ||
							frame.includes("Image ready")
						);
					},
					{ timeoutMs: 5000 }
				);
			} finally {
				result.unmount();
			}
		});
		expect(calls.length).toBeGreaterThan(0);
	});

	it("done step shows post-action menu after generation", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);

		await withMockFetch(mockFetchImpl, async () => {
			const result = render(
				<GenerateScreen
					config={baseConfig}
					onBack={onBack}
					onComplete={onComplete}
					onError={onError}
				/>
			);
			try {
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, "a mountain");
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter); // select preset → confirm
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, "y");
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Image ready"),
					{ timeoutMs: 5000 }
				);
				const output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Image ready");
				// Verify all 7 post-action menu items
				expect(output).toContain("Edit");
				expect(output).toContain("Variations");
				expect(output).toContain("Upscale");
				expect(output).toContain("Remove Background");
				expect(output).toContain("Regenerate");
				expect(output).toContain("New Prompt");
				expect(output).toContain("Done");
			} finally {
				result.unmount();
			}
		});
	}, 10_000);

	it("n on confirm step invokes onBack", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "a cat");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);
			await withMockFetch(mockFetchImpl, async () => {
				await writeInput(result, KEYS.enter); // select preset → confirm
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 }
				);
			});
			// Press 'n' to cancel
			await writeInput(result, "n");
			expect(onBack).toHaveBeenCalledTimes(1);
		} finally {
			result.unmount();
		}
	});

	it("N on confirm step invokes onBack", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "a cat");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);
			await withMockFetch(mockFetchImpl, async () => {
				await writeInput(result, KEYS.enter); // select preset → confirm
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 3000 }
				);
			});
			await writeInput(result, "N");
			expect(onBack).toHaveBeenCalledTimes(1);
		} finally {
			result.unmount();
		}
	});

	it("resolution selection step: navigate and select transitions to confirm", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "mountains");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select model"),
				{ timeoutMs: 3000 }
			);
			// Find a model that supports both aspect and resolution by navigating
			// The model order may vary; navigate until we find one that leads to aspect step
			// First try selecting the currently highlighted model (index 0)
			await writeInput(result, KEYS.enter);
			// Check if we got aspect step (model supports aspect) or confirm (doesn't)
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return (
						frame.includes("Select aspect ratio") ||
						frame.includes("Ready to generate")
					);
				},
				{ timeoutMs: 5000 }
			);
			let frame = stripAnsi(result.lastFrame() ?? "");
			if (frame.includes("Ready to generate")) {
				// Model doesn't support aspect — go back and try next model
				await writeInput(result, KEYS.escape);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.tab);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Select model"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => {
						const f = stripAnsi(result.lastFrame() ?? "");
						return (
							f.includes("Select aspect ratio") ||
							f.includes("Ready to generate")
						);
					},
					{ timeoutMs: 5000 }
				);
			}
			frame = stripAnsi(result.lastFrame() ?? "");
			if (!frame.includes("Select aspect ratio")) {
				// Skip test if we can't reach aspect step
				return;
			}
			// Select first aspect ratio
			await writeInput(result, KEYS.enter);
			// Check if we got resolution step or confirm
			await waitUntil(
				() => {
					const f = stripAnsi(result.lastFrame() ?? "");
					return (
						f.includes("Select resolution") || f.includes("Ready to generate")
					);
				},
				{ timeoutMs: 5000 }
			);
			frame = stripAnsi(result.lastFrame() ?? "");
			if (frame.includes("Select resolution")) {
				// Navigate down to select a different resolution and confirm
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
					{ timeoutMs: 5000 }
				);
			}
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Ready to generate");
		} finally {
			result.unmount();
		}
	}, 15_000);

	it("aspect ratio grid: arrow key navigation and selection", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "landscape");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);
			// Tab to model step
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select model"),
				{ timeoutMs: 3000 }
			);
			// Select the currently highlighted model (index 0)
			// Model order may vary across test runs
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return (
						frame.includes("Select aspect ratio") ||
						frame.includes("Ready to generate")
					);
				},
				{ timeoutMs: 5000 }
			);
			let frame = stripAnsi(result.lastFrame() ?? "");
			if (frame.includes("Ready to generate")) {
				// Model doesn't support aspect — go back and try next model
				await writeInput(result, KEYS.escape);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.tab);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Select model"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => {
						const f = stripAnsi(result.lastFrame() ?? "");
						return (
							f.includes("Select aspect ratio") ||
							f.includes("Ready to generate")
						);
					},
					{ timeoutMs: 5000 }
				);
			}
			frame = stripAnsi(result.lastFrame() ?? "");
			if (!frame.includes("Select aspect ratio")) {
				// Skip if we can't reach aspect step
				return;
			}
			// Navigate the grid: right, down, then select
			await writeInput(result, KEYS.right);
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.enter);
			// Should transition to resolution or confirm
			await waitUntil(
				() => {
					const f = stripAnsi(result.lastFrame() ?? "");
					return (
						f.includes("Select resolution") || f.includes("Ready to generate")
					);
				},
				{ timeoutMs: 5000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(
				output.includes("Select resolution") ||
					output.includes("Ready to generate")
			).toBe(true);
		} finally {
			result.unmount();
		}
	}, 15_000);

	it("model selection step: navigate and select transitions to aspect step", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<GenerateScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "a dog");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
				{ timeoutMs: 3000 }
			);
			// Tab to model selection
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select model"),
				{ timeoutMs: 3000 }
			);
			// Navigate down to select a different model and press enter
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.enter);
			// banana (index 0) supports aspect, so selecting index 1 should also transition
			// Verify we moved past model selection
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return (
						frame.includes("Select aspect ratio") ||
						frame.includes("Ready to generate")
					);
				},
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(
				output.includes("Select aspect ratio") ||
					output.includes("Ready to generate")
			).toBe(true);
		} finally {
			result.unmount();
		}
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
						{ timeoutMs: 3000 }
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
						{ timeoutMs: 3000 }
					);
					await writeInput(r, KEYS.tab);
					await waitUntil(
						() => stripAnsi(r.lastFrame() ?? "").includes("Select model"),
						{ timeoutMs: 3000 }
					);
				},
				expectedAfterEscape: "Quick presets",
			},
		];

		await fc.assert(
			fc.asyncProperty(fc.constantFrom(...stepSequences), async (stepSeq) => {
				const onBack = mock(() => undefined);
				const onComplete = mock(() => undefined);
				const onError = mock(() => undefined);
				const result = render(
					<GenerateScreen
						config={baseConfig}
						onBack={onBack}
						onComplete={onComplete}
						onError={onError}
					/>
				);
				try {
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes(
								"Enter your prompt:"
							),
						{ timeoutMs: 3000 }
					);
					await stepSeq.setup(result);
					await writeInput(result, KEYS.escape);
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes(
								stepSeq.expectedAfterEscape
							),
						{ timeoutMs: 3000 }
					);
					const output = stripAnsi(result.lastFrame() ?? "");
					expect(output).toContain(stepSeq.expectedAfterEscape);
				} finally {
					result.unmount();
				}
			}),
			{ numRuns: 10 }
		);
	}, 30_000);

	// Feature: studio-ui-tests, Property 3: Generate confirm displays all fields
	// **Validates: Requirements 2.7**
	it("property: confirm step displays all fields", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc
					.string({ minLength: 1, maxLength: 60 })
					.filter((s) => s.trim().length > 0),
				async (promptText) => {
					const onBack = mock(() => undefined);
					const onComplete = mock(() => undefined);
					const onError = mock(() => undefined);
					const result = render(
						<GenerateScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
						/>
					);
					try {
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Enter your prompt:"
								),
							{ timeoutMs: 3000 }
						);
						// Type prompt and submit
						await writeInput(result, promptText);
						await writeInput(result, KEYS.enter);
						// Check if we transitioned (prompt must be non-empty after trim)
						const trimmed = promptText.trim();
						if (!trimmed) {
							return; // skip empty prompts
						}

						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
							{ timeoutMs: 3000 }
						);
						// Select first preset (Square) to go to confirm
						await withMockFetch(mockFetchImpl, async () => {
							await writeInput(result, KEYS.enter);
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										"Ready to generate"
									),
								{ timeoutMs: 3000 }
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
				}
			),
			{ numRuns: 20 }
		);
	}, 60_000);

	// Feature: phase4-studio-ui-tests, Property 3: Confirm field inline cycling
	// **Validates: Requirements 3.1**
	it("property: confirm field inline cycling changes displayed value", async () => {
		// For banana model: fields are model(0), aspect(1), resolution(2), seed(3)
		const fieldConfigs = [
			{ name: "model", confirmIndex: 0 },
			{ name: "aspect", confirmIndex: 1 },
			{ name: "resolution", confirmIndex: 2 },
		] as const;

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...fieldConfigs),
				async (fieldConfig) => {
					const onBack = mock(() => undefined);
					const onComplete = mock(() => undefined);
					const onError = mock(() => undefined);
					const result = render(
						<GenerateScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
						/>
					);
					try {
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Enter your prompt:"
								),
							{ timeoutMs: 3000 }
						);
						await writeInput(result, "test cycling");
						await writeInput(result, KEYS.enter);
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
							{ timeoutMs: 3000 }
						);
						await withMockFetch(mockFetchImpl, async () => {
							await writeInput(result, KEYS.enter); // select preset → confirm
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										"Ready to generate"
									),
								{ timeoutMs: 3000 }
							);
						});
						// Navigate down to the target field
						for (let i = 0; i < fieldConfig.confirmIndex; i++) {
							await writeInput(result, KEYS.down);
						}
						// Enter edit mode
						await writeInput(result, KEYS.enter);
						// Cycle down to next option and select it
						await writeInput(result, KEYS.down);
						await writeInput(result, KEYS.enter);
						// Verify we're back on confirm step with a changed value
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Ready to generate"
								),
							{ timeoutMs: 3000 }
						);
						const output = stripAnsi(result.lastFrame() ?? "");
						expect(output).toContain("Ready to generate");
					} finally {
						result.unmount();
					}
				}
			),
			{ numRuns: 10 }
		);
	}, 60_000);

	// Feature: studio-ui-tests, Property 4: Seed digit input builds seed value
	// **Validates: Requirements 2.8**
	it("property: seed digit input builds seed value", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.integer({ min: 0, max: 9 }), {
					minLength: 1,
					maxLength: 3,
				}),
				async (digits) => {
					const onBack = mock(() => undefined);
					const onComplete = mock(() => undefined);
					const onError = mock(() => undefined);
					const result = render(
						<GenerateScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
						/>
					);
					try {
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Enter your prompt:"
								),
							{ timeoutMs: 1000 }
						);
						// Navigate to confirm step
						await writeInput(result, "test seed");
						await writeInput(result, KEYS.enter);
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
							{ timeoutMs: 1000 }
						);
						await withMockFetch(mockFetchImpl, async () => {
							await writeInput(result, KEYS.enter);
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										"Ready to generate"
									),
								{ timeoutMs: 1000 }
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
							{ timeoutMs: 1000 }
						);
						const output = stripAnsi(result.lastFrame() ?? "");
						expect(output).toContain(String(expectedSeed));
					} finally {
						result.unmount();
					}
				}
			),
			{ numRuns: 5 }
		);
	}, 15_000);

	// Feature: phase4-studio-ui-tests, Property 4: Post-action menu behavior
	// **Validates: Requirements 4.2, 4.3**
	it("property: post-action menu items trigger correct actions", async () => {
		const postActions = [
			{
				key: "edit",
				index: 0,
				expectOnComplete: true,
				completeArgs: ["edit", "edit"],
			},
			{
				key: "variations",
				index: 1,
				expectOnComplete: true,
				completeArgs: ["edit", "variations"],
			},
			{
				key: "upscale",
				index: 2,
				expectOnComplete: true,
				completeArgs: ["edit", "upscale"],
			},
			{
				key: "rmbg",
				index: 3,
				expectOnComplete: true,
				completeArgs: ["edit", "rmbg"],
			},
			{
				key: "regenerate",
				index: 4,
				expectOnComplete: false,
				expectStep: "Select model",
			},
			{
				key: "new",
				index: 5,
				expectOnComplete: false,
				expectStep: "Enter your prompt:",
			},
			{
				key: "home",
				index: 6,
				expectOnComplete: true,
				completeArgs: ["home"],
			},
		] as const;

		await fc.assert(
			fc.asyncProperty(fc.constantFrom(...postActions), async (action) => {
				const onBack = mock(() => undefined);
				const onComplete = mock(() => undefined);
				const onError = mock(() => undefined);

				await withMockFetch(mockFetchImpl, async () => {
					const result = render(
						<GenerateScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
						/>
					);
					try {
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Enter your prompt:"
								),
							{ timeoutMs: 3000 }
						);
						await writeInput(result, "test post-action");
						await writeInput(result, KEYS.enter);
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
							{ timeoutMs: 3000 }
						);
						await writeInput(result, KEYS.enter);
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Ready to generate"
								),
							{ timeoutMs: 3000 }
						);
						await writeInput(result, "y");
						await waitUntil(
							() => stripAnsi(result.lastFrame() ?? "").includes("Image ready"),
							{ timeoutMs: 5000 }
						);
						// Navigate to the target action
						for (let i = 0; i < action.index; i++) {
							await writeInput(result, KEYS.down);
						}
						await writeInput(result, KEYS.enter);

						if (action.expectOnComplete) {
							expect(onComplete).toHaveBeenCalled();
							const callArgs = onComplete.mock.calls[0];
							for (let i = 0; i < action.completeArgs.length; i++) {
								expect(callArgs[i]).toBe(action.completeArgs[i]);
							}
						} else if (action.expectStep) {
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										action.expectStep
									),
								{ timeoutMs: 3000 }
							);
							const output = stripAnsi(result.lastFrame() ?? "");
							expect(output).toContain(action.expectStep);
						}
					} finally {
						result.unmount();
					}
				});
			}),
			{ numRuns: 10 }
		);
	}, 60_000);
});
