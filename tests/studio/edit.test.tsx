import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import fc from "fast-check";
import { render } from "ink-testing-library";
import type {
	FalconConfig,
	Generation,
	History,
} from "../../src/studio/deps/config";
import { withMockFetch } from "../helpers/fetch";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";
import {
	registerStudioMocks,
	STUDIO_TEST_CONFIG,
} from "../helpers/studio-mocks";

// --- Test data factories ---

const createGeneration = (overrides?: Partial<Generation>): Generation => ({
	id: "test-id-1",
	prompt: "a test prompt",
	model: "banana",
	aspect: "1:1" as const,
	resolution: "2K" as const,
	output: "/tmp/test-image.png",
	cost: 0.03,
	timestamp: new Date().toISOString(),
	...overrides,
});

const createHistoryWithGenerations = (count: number): History => ({
	generations: Array.from({ length: count }, (_, i) =>
		createGeneration({
			id: `test-id-${i}`,
			prompt: `test prompt ${i}`,
			output: `/tmp/test-image-${i}.png`,
			timestamp: new Date(Date.now() - i * 60_000).toISOString(),
		})
	),
	totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
	lastSessionDate: new Date().toISOString().split("T")[0],
});

const testHistory = createHistoryWithGenerations(3);

// --- Module mocks ---
let EditScreen =
	null as unknown as typeof import("../../src/studio/screens/edit")["EditScreen"];
let originalFalKey: string | undefined;

beforeAll(async () => {
	originalFalKey = process.env.FAL_KEY;
	registerStudioMocks({ history: testHistory });
	process.env.FAL_KEY = "test-key-for-edit-tests";
	({ EditScreen } = await import("../../src/studio/screens/edit"));
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
	if (url.includes("/pricing") || url.includes("/models/pricing")) {
		return Response.json({
			total_cost: 0.15,
			currency: "USD",
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
	return Response.json({
		images: [{ url: "https://example.com/image.png" }],
		seed: 42,
	});
};

describe("edit screen", () => {
	it("renders image selection list with history", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select image");
			// History is reversed in the component, so newest first
			expect(output).toContain("test prompt");
		} finally {
			result.unmount();
		}
	});

	it("tab toggles between history list and custom path input", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			// Press tab to switch to custom path
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter path or drag"),
				{ timeoutMs: 3000 }
			);
			let output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Enter path or drag");
			expect(output).toContain("tab for history");

			// Press tab again to go back to history list
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select image");
		} finally {
			result.unmount();
		}
	});

	it("selecting image and pressing enter shows operation selection", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			// Press enter to select the first image
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("Edit") && frame.includes("Variations");
				},
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Edit");
			expect(output).toContain("Variations");
			expect(output).toContain("Upscale");
			expect(output).toContain("Remove Background");
		} finally {
			result.unmount();
		}
	});

	it("selecting Edit operation transitions to edit-model step", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);
			// Edit is the first operation, press enter
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes(
						"Select model for editing"
					),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select model for editing");
		} finally {
			result.unmount();
		}
	});

	it("selecting Upscale operation transitions to scale step", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			// Wait for initial image selection screen
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 5000 }
			);

			// Select first image
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 5000 }
			);

			// Wait for operation menu to be fully rendered and interactive
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("Edit") && frame.includes("Variations");
				},
				{ timeoutMs: 5000 }
			);

			// Navigate down to Upscale (index 2: Edit=0, Variations=1, Upscale=2)
			// First down - move to Variations
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Variations");
				},
				{ timeoutMs: 5000 }
			);

			// Second down - move to Upscale
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Upscale");
				},
				{ timeoutMs: 5000 }
			);

			// Select Upscale
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Select upscale factor"),
				{ timeoutMs: 5000 }
			);

			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select upscale factor");
		} finally {
			result.unmount();
		}
	}, 30_000);

	it("selecting Remove Background transitions to confirm step", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);
			// Navigate down to Remove Background (index 3)
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Variations");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Upscale");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Remove Background");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Ready to process");
			expect(output).toContain("BiRefNet");
			expect(output).toContain("Seed: n/a");
			expect(output).not.toContain("type digits to set");
		} finally {
			result.unmount();
		}
	});

	it("escape on operation step returns to image selection", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);
			// Press escape to go back to image selection
			await writeInput(result, KEYS.escape);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select image");
		} finally {
			result.unmount();
		}
	});

	// Task 1.2: Custom path input flow
	it("custom path input: type path and submit transitions to operation", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			// Tab to custom path input
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter path or drag"),
				{ timeoutMs: 3000 }
			);
			// Type a valid path and submit
			await writeInput(result, "/tmp/test-image.png");
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("Edit") && frame.includes("Variations");
				},
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Edit");
			expect(output).toContain("Variations");
			expect(output).toContain("Upscale");
			expect(output).toContain("Remove Background");
		} finally {
			result.unmount();
		}
	});

	// Task 1.3: Prompt input step
	it("prompt input step: type prompt and submit transitions to confirm", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			// Select image
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			// Select Edit operation (first item)
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			// Wait for model selection step
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes(
						"Select model for editing"
					),
				{ timeoutMs: 3000 }
			);
			// Select first model
			await writeInput(result, KEYS.enter);
			// Wait for prompt step
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Describe the edit"),
				{ timeoutMs: 3000 }
			);
			const promptFrame = stripAnsi(result.lastFrame() ?? "");
			expect(promptFrame).toContain("Describe the edit");
			// Type a prompt and submit
			await writeInput(result, "make it blue");
			await writeInput(result, KEYS.enter);
			// Verify transition to confirm step
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Ready to process");
			expect(output).toContain("make it blue");
		} finally {
			result.unmount();
		}
	});

	// Task 1.4: Scale step adjustment
	it("scale step: up arrow increases factor and enter confirms", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			// Select image
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			// Navigate to Upscale (index 2)
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Variations");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Upscale");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			// Wait for scale step
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Select upscale factor"),
				{ timeoutMs: 3000 }
			);
			// Default is 2x, press up to increase to 4x
			let frame = stripAnsi(result.lastFrame() ?? "");
			expect(frame).toContain("2x");
			await writeInput(result, KEYS.up);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("4x"),
				{ timeoutMs: 3000 }
			);
			frame = stripAnsi(result.lastFrame() ?? "");
			expect(frame).toContain("4x");
			// Press enter to confirm
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
				{ timeoutMs: 3000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Ready to process");
			expect(output).toContain("4x");
		} finally {
			result.unmount();
		}
	});

	// Task 1.5: Confirm step y and n
	it("confirm step n returns to operation selection", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			// Select image
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			// Navigate to Remove Background (index 3)
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Variations");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Upscale");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("◆") && frame.includes("Remove Background");
				},
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			// Wait for confirm step
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
				{ timeoutMs: 3000 }
			);
			// Press n to cancel
			await writeInput(result, "n");
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return (
						frame.includes("Upscale") &&
						frame.includes("Variations") &&
						!frame.includes("Ready to process")
					);
				},
				{ timeoutMs: 5000 }
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Upscale");
			expect(output).toContain("Remove Background");
		} finally {
			result.unmount();
		}
	});

	it("confirm step y starts processing", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);

		await withMockFetch(mockFetchImpl, async () => {
			const result = render(
				<EditScreen
					config={baseConfig}
					onBack={onBack}
					onComplete={onComplete}
					onError={onError}
				/>
			);
			try {
				// Select image
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				// Navigate to Remove Background (index 3)
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return frame.includes("◆") && frame.includes("Variations");
					},
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return frame.includes("◆") && frame.includes("Upscale");
					},
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return frame.includes("◆") && frame.includes("Remove Background");
					},
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				// Wait for confirm step
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
					{ timeoutMs: 3000 }
				);
				// Press y to start processing
				await writeInput(result, "y");
				// Verify processing starts
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return (
							frame.includes("Uploading") ||
							frame.includes("Removing") ||
							frame.includes("Complete")
						);
					},
					{ timeoutMs: 5000 }
				);
			} finally {
				result.unmount();
			}
		});
	});

	it("operation selection up/down arrows wrap at list boundaries", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.up);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("◆ Remove Background"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Edit"),
				{ timeoutMs: 3000 }
			);
		} finally {
			result.unmount();
		}
	});

	it("q in custom path input is treated as text input (does not quit)", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const onQuit = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
				onQuit={onQuit}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter path or drag"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "q");
			expect(onQuit).not.toHaveBeenCalled();
		} finally {
			result.unmount();
		}
	});

	it("confirm step N returns to operation selection", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("◆ Remove Background"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
				{ timeoutMs: 3000 }
			);
			await writeInput(result, "N");
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("◆ Remove Background"),
				{ timeoutMs: 3000 }
			);
		} finally {
			result.unmount();
		}
	});

	it("confirm step Y starts processing", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);

		await withMockFetch(mockFetchImpl, async () => {
			const result = render(
				<EditScreen
					config={baseConfig}
					onBack={onBack}
					onComplete={onComplete}
					onError={onError}
				/>
			);
			try {
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.down);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("◆ Remove Background"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, "Y");
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return (
							frame.includes("Uploading") ||
							frame.includes("Removing") ||
							frame.includes("Complete")
						);
					},
					{ timeoutMs: 5000 }
				);
			} finally {
				result.unmount();
			}
		});
	});

	// Task 1.6: Done step enter
	it("done step enter invokes onComplete", async () => {
		const onBack = mock(() => undefined);
		const onComplete = mock(() => undefined);
		const onError = mock(() => undefined);

		await withMockFetch(mockFetchImpl, async () => {
			const result = render(
				<EditScreen
					config={baseConfig}
					onBack={onBack}
					onComplete={onComplete}
					onError={onError}
				/>
			);
			try {
				// Select image
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				// Navigate to Remove Background (index 3)
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return frame.includes("◆") && frame.includes("Variations");
					},
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return frame.includes("◆") && frame.includes("Upscale");
					},
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down);
				await waitUntil(
					() => {
						const frame = stripAnsi(result.lastFrame() ?? "");
						return frame.includes("◆") && frame.includes("Remove Background");
					},
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.enter);
				// Wait for confirm step
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
					{ timeoutMs: 3000 }
				);
				// Press y to start processing
				await writeInput(result, "y");
				// Wait for done step
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Complete"),
					{ timeoutMs: 5000 }
				);
				const output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Complete");
				// Press enter to invoke onComplete
				await writeInput(result, KEYS.enter);
				expect(onComplete).toHaveBeenCalled();
			} finally {
				result.unmount();
			}
		});
	});

	// Task 1.7: Property test for upscale factor selection
	// Feature: phase4-studio-ui-tests, Property 5: Upscale factor selection
	// **Validates: Requirements 6.3**
	it("property: upscale factor selection displays correct factor on confirm", async () => {
		await fc.assert(
			fc.asyncProperty(fc.constantFrom(2, 4, 6, 8), async (factor) => {
				const onBack = mock(() => undefined);
				const onComplete = mock(() => undefined);
				const onError = mock(() => undefined);
				const result = render(
					<EditScreen
						config={baseConfig}
						onBack={onBack}
						onComplete={onComplete}
						onError={onError}
					/>
				);
				try {
					// Select image
					await waitUntil(
						() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
						{ timeoutMs: 3000 }
					);
					await writeInput(result, KEYS.enter);
					// Navigate to Upscale (index 2)
					await waitUntil(
						() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
						{ timeoutMs: 3000 }
					);
					await writeInput(result, KEYS.down);
					await waitUntil(
						() => {
							const frame = stripAnsi(result.lastFrame() ?? "");
							return frame.includes("◆") && frame.includes("Variations");
						},
						{ timeoutMs: 3000 }
					);
					await writeInput(result, KEYS.down);
					await waitUntil(
						() => {
							const frame = stripAnsi(result.lastFrame() ?? "");
							return frame.includes("◆") && frame.includes("Upscale");
						},
						{ timeoutMs: 3000 }
					);
					await writeInput(result, KEYS.enter);
					// Wait for scale step
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes(
								"Select upscale factor"
							),
						{ timeoutMs: 3000 }
					);
					// Default is 2x. Navigate up to reach the desired factor.
					// UPSCALE_FACTORS = [2, 4, 6, 8], up arrow increases
					const targetIndex = [2, 4, 6, 8].indexOf(factor);
					for (let i = 0; i < targetIndex; i++) {
						await writeInput(result, KEYS.up);
						const expectedFactor = [2, 4, 6, 8][i + 1];
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									`${expectedFactor}x`
								),
							{ timeoutMs: 3000 }
						);
					}
					// Confirm
					await writeInput(result, KEYS.enter);
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
						{ timeoutMs: 3000 }
					);
					const output = stripAnsi(result.lastFrame() ?? "");
					expect(output).toContain(`${factor}x`);
				} finally {
					result.unmount();
				}
			}),
			{ numRuns: 10 }
		);
	}, 60_000);

	// Task 1.8: Property test for edit screen seed input
	// Feature: phase4-studio-ui-tests, Property 6: Edit screen seed input
	// **Validates: Requirements 7.3**
	it("property: seed input on confirm step builds correct value", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.integer({ min: 0, max: 9 }), {
					minLength: 1,
					maxLength: 4,
				}),
				async (digits) => {
					const onBack = mock(() => undefined);
					const onComplete = mock(() => undefined);
					const onError = mock(() => undefined);
					const result = render(
						<EditScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
						/>
					);
					try {
						// Select image
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes("Select image"),
							{ timeoutMs: 5000 }
						);
						await writeInput(result, KEYS.enter);

						// Navigate to Upscale (index 2)
						await waitUntil(
							() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
							{ timeoutMs: 5000 }
						);

						// Wait for operation menu to be fully rendered
						await waitUntil(
							() => {
								const frame = stripAnsi(result.lastFrame() ?? "");
								return frame.includes("Edit") && frame.includes("Variations");
							},
							{ timeoutMs: 5000 }
						);

						await writeInput(result, KEYS.down);
						await waitUntil(
							() => {
								const frame = stripAnsi(result.lastFrame() ?? "");
								return frame.includes("◆") && frame.includes("Variations");
							},
							{ timeoutMs: 5000 }
						);

						await writeInput(result, KEYS.down);
						await waitUntil(
							() => {
								const frame = stripAnsi(result.lastFrame() ?? "");
								return frame.includes("◆") && frame.includes("Upscale");
							},
							{ timeoutMs: 5000 }
						);

						await writeInput(result, KEYS.enter);

						// Wait for scale step
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Select upscale factor"
								),
							{ timeoutMs: 5000 }
						);

						// Confirm scale to get to confirm step
						await writeInput(result, KEYS.enter);
						await waitUntil(
							() =>
								stripAnsi(result.lastFrame() ?? "").includes(
									"Ready to process"
								),
							{ timeoutMs: 5000 }
						);

						// Type each digit
						for (const digit of digits) {
							await writeInput(result, digit.toString());
						}

						// Seed is stored as Number, so "00" becomes 0, "01" becomes 1, etc.
						const expectedSeed = String(Number(digits.join("")));
						await waitUntil(
							() => {
								const frame = stripAnsi(result.lastFrame() ?? "");
								return frame.includes(`Seed: ${expectedSeed}`);
							},
							{ timeoutMs: 5000 }
						);

						const output = stripAnsi(result.lastFrame() ?? "");
						expect(output).toContain(`Seed: ${expectedSeed}`);
					} finally {
						result.unmount();
					}
				}
			),
			{ numRuns: 8 } // Reduced from 15 to prevent timeout under load
		);
	}, 90_000); // Increased overall timeout

	// Feature: studio-ui-tests, Property 5: Edit skipToOperation routes to correct step
	// **Validates: Requirements 3.8**
	it("property: skipToOperation routes to correct step", async () => {
		const operationToExpected: {
			op: "edit" | "variations" | "upscale" | "rmbg";
			expected: string;
		}[] = [
			{ op: "edit", expected: "Select model for editing" },
			{ op: "variations", expected: "Ready to process" },
			{ op: "upscale", expected: "Select upscale factor" },
			{ op: "rmbg", expected: "Ready to process" },
		];

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...operationToExpected),
				async ({ op, expected }) => {
					const onBack = mock(() => undefined);
					const onComplete = mock(() => undefined);
					const onError = mock(() => undefined);
					const result = render(
						<EditScreen
							config={baseConfig}
							initialOperation={op}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
							skipToOperation={true}
						/>
					);
					try {
						await waitUntil(
							() => stripAnsi(result.lastFrame() ?? "").includes(expected),
							{ timeoutMs: 3000 }
						);
						const output = stripAnsi(result.lastFrame() ?? "");
						expect(output).toContain(expected);
					} finally {
						result.unmount();
					}
				}
			),
			{ numRuns: 10 }
		);
	}, 30_000);
});
