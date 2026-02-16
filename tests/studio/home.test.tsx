import { describe, expect, it, mock } from "bun:test";
import fc from "fast-check";
import { render } from "ink-testing-library";
import type { History } from "../../src/studio/deps/config";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

// Lazy import to avoid top-level side effects
const { HomeScreen } = await import("../../src/studio/screens/home");

const createEmptyHistory = (): History => ({
	generations: [],
	totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
	lastSessionDate: new Date().toISOString().split("T")[0],
});

const createHistoryWithLastGeneration = (): History => ({
	generations: [
		{
			id: "test-id-1",
			prompt: "a beautiful sunset over the ocean",
			model: "banana",
			aspect: "1:1" as const,
			resolution: "2K" as const,
			output: "/tmp/test-image.png",
			cost: 0.03,
			timestamp: new Date().toISOString(),
		},
	],
	totalCost: { USD: { session: 0.03, today: 0.03, allTime: 0.03 } },
	lastSessionDate: new Date().toISOString().split("T")[0],
});

describe("home screen", () => {
	it("renders all four menu items", async () => {
		const onNavigate = mock(() => {});
		const result = render(
			<HomeScreen history={createEmptyHistory()} onNavigate={onNavigate} />,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Generate");
			expect(output).toContain("Edit");
			expect(output).toContain("Gallery");
			expect(output).toContain("Settings");
		} finally {
			result.unmount();
		}
	});

	it("down arrow moves selection to next item", async () => {
		const onNavigate = mock(() => {});
		const result = render(
			<HomeScreen history={createEmptyHistory()} onNavigate={onNavigate} />,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			// Initially "Generate" is selected (◆)
			let output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("◆ Generate");

			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Edit"),
				{ timeoutMs: 3000 },
			);
			output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("◆ Edit");
		} finally {
			result.unmount();
		}
	});

	it("up arrow on first item wraps to last item", async () => {
		const onNavigate = mock(() => {});
		const result = render(
			<HomeScreen history={createEmptyHistory()} onNavigate={onNavigate} />,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			// First item is selected by default
			await writeInput(result, KEYS.up);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Settings"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("◆ Settings");
		} finally {
			result.unmount();
		}
	});

	it("down arrow on last item wraps to first item", async () => {
		const onNavigate = mock(() => {});
		const result = render(
			<HomeScreen history={createEmptyHistory()} onNavigate={onNavigate} />,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			// Navigate to last item (Settings)
			await writeInput(result, KEYS.up);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Settings"),
				{ timeoutMs: 3000 },
			);
			// Press down to wrap to first
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Generate"),
				{ timeoutMs: 3000 },
			);
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("◆ Generate");
		} finally {
			result.unmount();
		}
	});

	it("displays last generation prompt and model with non-empty history", async () => {
		const onNavigate = mock(() => {});
		const result = render(
			<HomeScreen
				history={createHistoryWithLastGeneration()}
				onNavigate={onNavigate}
			/>,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("a beautiful sunset over the ocean");
			expect(output).toContain("Nano Banana Pro");
		} finally {
			result.unmount();
		}
	});

	// Feature: studio-ui-tests, Property 1: Home menu enter navigates to correct screen
	// **Validates: Requirements 1.5**
	it("property: enter navigates to correct screen for any menu index", async () => {
		const screenKeys = ["generate", "edit", "gallery", "settings"] as const;

		await fc.assert(
			fc.asyncProperty(fc.integer({ min: 0, max: 3 }), async (index) => {
				const onNavigate = mock(() => {});
				const result = render(
					<HomeScreen history={createEmptyHistory()} onNavigate={onNavigate} />,
				);
				try {
					await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
						timeoutMs: 3000,
					});
					// Navigate down to the target index
					for (let i = 0; i < index; i++) {
						await writeInput(result, KEYS.down);
					}
					await writeInput(result, KEYS.enter);
					expect(onNavigate).toHaveBeenCalledWith(screenKeys[index]);
				} finally {
					result.unmount();
				}
			}),
			{ numRuns: 10 },
		);
	});
});
