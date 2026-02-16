import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { render } from "ink-testing-library";
import { stripAnsi, waitUntil } from "../helpers/ink";

const { Spinner } = await import("../../src/studio/components/spinner");

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

describe("Spinner", () => {
	// Task 10.1: Unit tests for Spinner rendering
	// Requirements: 10.1
	it("renders the provided text", async () => {
		const result = render(<Spinner text="Loading..." />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Loading...");
		} finally {
			result.unmount();
		}
	});

	it("displays a spinner frame character", async () => {
		const result = render(<Spinner text="Working" />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			const hasFrame = SPINNER_FRAMES.some((f) => output.includes(f));
			expect(hasFrame).toBe(true);
		} finally {
			result.unmount();
		}
	});

	// Task 10.2: Test for frame cycling
	// Requirements: 10.2
	it("cycles through spinner frames over time", async () => {
		const result = render(<Spinner text="Cycling" />);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});

			// Capture the initial frame character
			const getFrame = () => {
				const output = stripAnsi(result.lastFrame() ?? "");
				return SPINNER_FRAMES.find((f) => output.includes(f));
			};

			const initialFrame = getFrame();
			expect(initialFrame).toBeDefined();

			// Wait long enough for the frame to change (spinner ticks every 80ms)
			await waitUntil(() => getFrame() !== initialFrame, {
				timeoutMs: 3000,
				intervalMs: 30,
			});

			const nextFrame = getFrame();
			expect(nextFrame).toBeDefined();
			expect(nextFrame).not.toBe(initialFrame);

			// Verify the new frame is also a valid spinner frame
			expect(SPINNER_FRAMES).toContain(nextFrame);
		} finally {
			result.unmount();
		}
	});

	// Task 10.3: Property test for Spinner text rendering
	// Feature: phase5-config-integration-tests, Property 6: Spinner renders provided text
	// **Validates: Requirements 10.1**
	it("property: any non-empty text is rendered with a spinner frame", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc
					.stringMatching(/^[A-Za-z0-9 ,.?!:_-]{1,50}$/)
					.filter((text) => text.trim().length > 0 && text === text.trim()),
				async (text) => {
					const result = render(<Spinner text={text} />);
					try {
						await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
							timeoutMs: 3000,
						});
						const output = stripAnsi(result.lastFrame() ?? "");
						// Output should contain the provided text
						expect(output).toContain(text);
						// Output should contain at least one spinner frame character
						const hasFrame = SPINNER_FRAMES.some((f) => output.includes(f));
						expect(hasFrame).toBe(true);
					} finally {
						result.unmount();
					}
				},
			),
			{ numRuns: 20 },
		);
	});
});
