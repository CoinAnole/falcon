import { describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import type { Generation, History } from "../../src/studio/deps/config";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";
import { registerStudioMocks } from "../helpers/studio-mocks";

// Mock openImage to prevent actual file system access
const openImageMock = mock(() => Promise.resolve());
registerStudioMocks({
	includeConfig: false,
	includePaths: false,
	includeLogger: false,
	imageOverrides: { openImage: openImageMock },
});
const { GalleryScreen } = await import("../../src/studio/screens/Gallery");

const createEmptyHistory = (): History => ({
	generations: [],
	totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
	lastSessionDate: new Date().toISOString().split("T")[0],
});

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
			timestamp: new Date(Date.now() - i * 60000).toISOString(),
		}),
	),
	totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
	lastSessionDate: new Date().toISOString().split("T")[0],
});

describe("gallery screen", () => {
	it("renders empty state with no generations", async () => {
		const onBack = mock(() => {});
		const result = render(
			<GalleryScreen history={createEmptyHistory()} onBack={onBack} />,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("No generations yet");
		} finally {
			result.unmount();
		}
	});

	it("displays prompts and model names with generations", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(3);
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("test prompt");
			expect(output).toContain("Nano Banana Pro");
		} finally {
			result.unmount();
		}
	});

	it("shows pagination controls with more than 8 generations", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(12);
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Page 1/2");
		} finally {
			result.unmount();
		}
	});

	it("right arrow navigates to next page", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(12);
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 1/2"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.right);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 2/2"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Page 2/2");
		} finally {
			result.unmount();
		}
	});

	it("left arrow navigates to previous page", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(12);
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 1/2"),
				{ timeoutMs: 3000 },
			);
			// Go to page 2 first
			await writeInput(result, KEYS.right);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 2/2"),
				{ timeoutMs: 3000 },
			);
			// Go back to page 1
			await writeInput(result, KEYS.left);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 1/2"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Page 1/2");
		} finally {
			result.unmount();
		}
	});

	it("up/down arrow moves selection between items", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(3);
		// Gallery reverses: display order is [prompt 2, prompt 1, prompt 0] (newest first)
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			// First item selected by default (◆) — should be "test prompt 2" (newest)
			const output = stripAnsi(result.lastFrame() ?? "");
			const lines = output.split("\n").filter((l) => l.includes("◆"));
			expect(lines.length).toBe(1);
			expect(lines[0]).toContain("test prompt 2");

			// Move down — should select "test prompt 1"
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					const selected = frame.split("\n").filter((l) => l.includes("◆"));
					return selected.length === 1 && selected[0].includes("test prompt 1");
				},
				{ timeoutMs: 3000 },
			);

			// Move back up — should select "test prompt 2" again
			await writeInput(result, KEYS.up);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					const selected = frame.split("\n").filter((l) => l.includes("◆"));
					return selected.length === 1 && selected[0].includes("test prompt 2");
				},
				{ timeoutMs: 3000 },
			);
		} finally {
			result.unmount();
		}
	});

	it("escape invokes onBack callback", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(3);
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			await writeInput(result, KEYS.escape);
			expect(onBack).toHaveBeenCalledTimes(1);
		} finally {
			result.unmount();
		}
	});

	it("down arrow on last item of page 1 navigates to page 2 with first item selected", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(12);
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 1/2"),
				{ timeoutMs: 3000 },
			);

			// Navigate down 7 times to reach the last item on page 1 (index 7)
			for (let i = 0; i < 7; i++) {
				await writeInput(result, KEYS.down);
			}

			// Verify we're still on page 1 with the last item selected
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("Page 1/2") && frame.includes("◆");
				},
				{ timeoutMs: 3000 },
			);

			// Press down once more to cross to page 2
			await writeInput(result, KEYS.down);

			// Verify page 2 is shown and first item is selected
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 2/2"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Page 2/2");

			// Verify the first item on page 2 is selected (◆)
			const selectedLines = output.split("\n").filter((l) => l.includes("◆"));
			expect(selectedLines.length).toBe(1);
		} finally {
			result.unmount();
		}
	});

	it("up arrow on first item of page 2 navigates to page 1 with last item selected", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(12);
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 1/2"),
				{ timeoutMs: 3000 },
			);

			// Navigate to page 2
			await writeInput(result, KEYS.right);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 2/2"),
				{ timeoutMs: 3000 },
			);

			// First item on page 2 is selected by default (index 0)
			let output = stripAnsi(result.lastFrame() ?? "");
			let selectedLines = output.split("\n").filter((l) => l.includes("◆"));
			expect(selectedLines.length).toBe(1);

			// Press up on the first item of page 2
			await writeInput(result, KEYS.up);

			// Verify page changes back to page 1
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Page 1/2"),
				{ timeoutMs: 3000 },
			);

			output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Page 1/2");

			// Verify the last item on page 1 is selected (◆)
			// Page 1 has 8 items; the last one (index 7) should be selected
			selectedLines = output.split("\n").filter((l) => l.includes("◆"));
			expect(selectedLines.length).toBe(1);

			// The last item on page 1 corresponds to generation index 7 in reversed order
			// Reversed: [prompt 11, prompt 10, ..., prompt 4] — last on page 1 is prompt 4
			expect(selectedLines[0]).toContain("test prompt 4");
		} finally {
			result.unmount();
		}
	});

	it("enter opens the selected generation's image", async () => {
		const onBack = mock(() => {});
		const history = createHistoryWithGenerations(3);
		// Gallery reverses: display order is newest first, so index 0 = generations[2] = "test prompt 0" with id "test-id-0"
		// Actually: createHistoryWithGenerations creates [test-id-0, test-id-1, test-id-2], reversed = [test-id-2, test-id-1, test-id-0]
		// The first selected item (index 0) is test-id-2 which has output "/tmp/test-image.png" (default)
		const result = render(<GalleryScreen history={history} onBack={onBack} />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			openImageMock.mockClear();
			await writeInput(result, KEYS.enter);
			await waitUntil(() => openImageMock.mock.calls.length > 0, {
				timeoutMs: 3000,
			});
			expect(openImageMock).toHaveBeenCalledTimes(1);
			expect(openImageMock.mock.calls[0][0]).toBe("/tmp/test-image.png");
		} finally {
			result.unmount();
		}
	});
});
