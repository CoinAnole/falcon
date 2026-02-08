import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/studio/App";
import type { FalconConfig, History } from "../../src/utils/config";
import { KEYS, stripAnsi, writeInput } from "../helpers/ink";

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
	it("renders the home menu", () => {
		const result = renderApp();
		const output = stripAnsi(result.lastFrame() ?? "");
		expect(output).toContain("Generate");
		expect(output).toContain("Gallery");
		result.unmount();
	});

	it("navigates to generate screen", async () => {
		const result = renderApp();
		await writeInput(result, KEYS.enter);
		const output = stripAnsi(result.lastFrame() ?? "");
		expect(output).toContain("Enter your prompt:");
		result.unmount();
	});

	it("routes to settings and back with escape", async () => {
		const result = renderApp();
		await writeInput(result, KEYS.down);
		await writeInput(result, KEYS.down);
		await writeInput(result, KEYS.down);
		await writeInput(result, KEYS.enter);
		let output = stripAnsi(result.lastFrame() ?? "");
		expect(output).toContain("Settings");

		await writeInput(result, KEYS.escape);
		output = stripAnsi(result.lastFrame() ?? "");
		expect(output).toContain("Generate");
		result.unmount();
	});

	it("opens gallery and returns to home", async () => {
		const result = renderApp();
		await writeInput(result, KEYS.down);
		await writeInput(result, KEYS.down);
		await writeInput(result, KEYS.enter);
		let output = stripAnsi(result.lastFrame() ?? "");
		expect(output).toContain("No generations yet");

		await writeInput(result, KEYS.escape);
		output = stripAnsi(result.lastFrame() ?? "");
		expect(output).toContain("Generate");
		result.unmount();
	});
});
