import { describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import type { Generation, History } from "../../src/utils/config";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

// Lazy import to avoid top-level side effects
const { GalleryScreen } = await import("../../src/studio/screens/Gallery");

// Mock openImage to prevent actual file system access
mock.module("../../src/utils/image", () => ({
	openImage: mock(() => Promise.resolve()),
}));

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
});
