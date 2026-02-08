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
} as const;

export async function waitForRender(delayMs = 8): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function waitUntil(
	check: () => boolean,
	options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
	const { timeoutMs = 3000, intervalMs = 10 } = options;
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		await waitForRender(intervalMs);
		if (check()) return;
	}

	throw new Error("Timed out waiting for render");
}

export function stripAnsi(value: string): string {
	const esc = String.fromCharCode(27);
	const ansiPattern = new RegExp(`${esc}\\[[0-9;]*m`, "g");
	return value.replace(ansiPattern, "");
}

export async function writeInput(
	result: InkRenderResult,
	input: string,
): Promise<void> {
	result.stdin.write(input);
	await waitForRender();
}
