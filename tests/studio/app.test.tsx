import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/studio/App";
import type { FalconConfig, History } from "../../src/utils/config";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

const APP_TEST_TIMEOUT_MS = 15_000;

const baseConfig: FalconConfig = {
	defaultModel: "banana",
	defaultAspect: "1:1",
	defaultResolution: "2K",
	openAfterGenerate: false,
	upscaler: "clarity",
	backgroundRemover: "rmbg",
};

const createHistory = (): History => ({
	generations: [],
	totalCost: {
		USD: { session: 0, today: 0, allTime: 0 },
	},
	lastSessionDate: new Date().toISOString().split("T")[0],
});

const renderApp = (history: History = createHistory()) =>
	render(
		<App
			config={baseConfig}
			history={history}
			onConfigChange={async () => {}}
			onHistoryChange={async () => {}}
		/>,
	);

describe("studio app routing", () => {
	it(
		"renders the home menu",
		async () => {
			const result = renderApp();
			try {
				await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
					timeoutMs: 3000,
				});
				const output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Generate");
				expect(output).toContain("Gallery");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS,
	);

	it(
		"navigates to generate screen",
		async () => {
			const result = renderApp();
			try {
				await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
					timeoutMs: 3000,
				});
				await writeInput(result, KEYS.enter);
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
		},
		APP_TEST_TIMEOUT_MS,
	);

	it(
		"routes to settings and back with escape",
		async () => {
			const result = renderApp();
			try {
				await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
					timeoutMs: 3000,
				});
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Settings"),
					{ timeoutMs: 3000 },
				);
				let output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Settings");

				await writeInput(result, KEYS.escape);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Generate"),
					{ timeoutMs: 3000 },
				);
				output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Generate");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS,
	);

	it(
		"opens gallery and returns to home",
		async () => {
			const result = renderApp();
			try {
				await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
					timeoutMs: 3000,
				});
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.down);
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("No generations yet"),
					{ timeoutMs: 3000 },
				);
				let output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("No generations yet");

				await writeInput(result, KEYS.escape);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Generate"),
					{ timeoutMs: 3000 },
				);
				output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Generate");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS,
	);
});
