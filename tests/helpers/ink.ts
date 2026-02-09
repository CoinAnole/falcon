export interface InkRenderResult {
	stdin: { write: (data: string) => void };
	lastFrame: () => string | undefined;
	unmount: () => void;
}

const ESC = "\u001b";

export const KEYS = {
	up: `${ESC}[A`,
	down: `${ESC}[B`,
	right: `${ESC}[C`,
	left: `${ESC}[D`,
	enter: "\r",
	escape: ESC,
	tab: "\t",
	backspace: "\x7f",
} as const;

export async function waitForRender(delayMs = 50): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function waitUntil(
	check: () => boolean,
	options: {
		timeoutMs?: number;
		intervalMs?: number;
		initialDelayMs?: number;
	} = {},
): Promise<void> {
	const { timeoutMs = 5000, intervalMs = 50, initialDelayMs = 50 } = options;
	const startedAt = Date.now();

	// Small initial delay to allow React to process pending updates
	if (initialDelayMs > 0) {
		await waitForRender(initialDelayMs);
	}

	while (Date.now() - startedAt < timeoutMs) {
		if (check()) return;
		await waitForRender(intervalMs);
	}

	throw new Error("Timed out waiting for render");
}

import stripAnsi from "strip-ansi";

export { stripAnsi };

export async function writeInput(
	result: InkRenderResult,
	input: string,
): Promise<void> {
	result.stdin.write(input);
	await waitForRender();
}
