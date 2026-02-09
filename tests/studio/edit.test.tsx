import { describe, expect, it, mock } from "bun:test";
import fc from "fast-check";
import { render } from "ink-testing-library";
import type { FalconConfig, Generation, History } from "../../src/utils/config";
import { withMockFetch } from "../helpers/fetch";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

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
			timestamp: new Date(Date.now() - i * 60000).toISOString(),
		}),
	),
	totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
	lastSessionDate: new Date().toISOString().split("T")[0],
});

const testHistory = createHistoryWithGenerations(3);

// --- Module mocks ---

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
	loadHistory: mock(() => Promise.resolve(testHistory)),
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

process.env.FAL_KEY = "test-key-for-edit-tests";

const { EditScreen } = await import("../../src/studio/screens/Edit");

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
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
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
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			// Press tab to switch to custom path
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Enter path or drag"),
				{ timeoutMs: 3000 },
			);
			let output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Enter path or drag");
			expect(output).toContain("tab for history");

			// Press tab again to go back to history list
			await writeInput(result, KEYS.tab);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select image");
		} finally {
			result.unmount();
		}
	});

	it("selecting image and pressing enter shows operation selection", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			// Press enter to select the first image
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("Edit") && frame.includes("Variations");
				},
				{ timeoutMs: 3000 },
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
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 },
			);
			// Edit is the first operation, press enter
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes(
						"Select model for editing",
					),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select model for editing");
		} finally {
			result.unmount();
		}
	});

	it("selecting Upscale operation transitions to scale step", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 },
			);
			// Navigate down to Upscale (index 2: Edit=0, Variations=1, Upscale=2)
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("Select upscale factor"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select upscale factor");
		} finally {
			result.unmount();
		}
	});

	it("selecting Remove Background transitions to confirm step", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 },
			);
			// Navigate down to Remove Background (index 3)
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.down);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Ready to process"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Ready to process");
			expect(output).toContain("BiRefNet");
		} finally {
			result.unmount();
		}
	});

	it("escape on operation step returns to image selection", async () => {
		const onBack = mock(() => {});
		const onComplete = mock(() => {});
		const onError = mock(() => {});
		const result = render(
			<EditScreen
				config={baseConfig}
				onBack={onBack}
				onComplete={onComplete}
				onError={onError}
			/>,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Variations"),
				{ timeoutMs: 3000 },
			);
			// Press escape to go back to image selection
			await writeInput(result, KEYS.escape);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Select image"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Select image");
		} finally {
			result.unmount();
		}
	});

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
					const onBack = mock(() => {});
					const onComplete = mock(() => {});
					const onError = mock(() => {});
					const result = render(
						<EditScreen
							config={baseConfig}
							onBack={onBack}
							onComplete={onComplete}
							onError={onError}
							skipToOperation={true}
							initialOperation={op}
						/>,
					);
					try {
						await waitUntil(
							() => stripAnsi(result.lastFrame() ?? "").includes(expected),
							{ timeoutMs: 3000 },
						);
						const output = stripAnsi(result.lastFrame() ?? "");
						expect(output).toContain(expected);
					} finally {
						result.unmount();
					}
				},
			),
			{ numRuns: 100 },
		);
	}, 120_000);
});
