import { describe, expect, it, mock } from "bun:test";
import fc from "fast-check";
import { render } from "ink-testing-library";
import { GENERATION_MODELS, MODELS } from "../../src/api/models";
import type { FalconConfig } from "../../src/studio/deps/config";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

const { SettingsScreen } = await import("../../src/studio/screens/settings");

const baseConfig: FalconConfig = {
	defaultModel: "banana",
	defaultAspect: "1:1",
	defaultResolution: "2K",
	openAfterGenerate: false,
	upscaler: "clarity",
	backgroundRemover: "rmbg",
	promptExpansion: false,
};

const waitForRender = async (result: ReturnType<typeof render>) => {
	await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
		timeoutMs: 3000,
	});
};

const selectedLine = (result: ReturnType<typeof render>, label: string): string => {
	const output = stripAnsi(result.lastFrame() ?? "");
	return output.split("\n").find((line) => line.includes(`◆ ${label}`)) ?? "";
};

async function goToSetting(result: ReturnType<typeof render>, settingIndex: number) {
	for (let index = 0; index < settingIndex; index++) {
		await writeInput(result, KEYS.down);
	}
}

describe("settings screen", () => {
	it("renders all settings and auto-save hint", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			const output = stripAnsi(result.lastFrame() ?? "");

			expect(output).toContain("Default Model");
			expect(output).toContain("Default Aspect");
			expect(output).toContain("Default Resolution");
			expect(output).toContain("Upscaler");
			expect(output).toContain("Background Remover");
			expect(output).toContain("Open After Generate");
			expect(output).toContain("Prompt Expansion");
			expect(output).toContain("API Key");
			expect(output).toContain("enter edit │ esc back │ q quit │ s auto-save info");
			expect(output).toContain("Nano Banana Pro");
			expect(output).toContain("Not set");
		} finally {
			result.unmount();
		}
	});

	it("up/down arrow navigation wraps in list step", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.up);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ API Key"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 }
			);
		} finally {
			result.unmount();
		}
	});

	it("enter on API key opens text editor", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 7);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ API Key"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("enter save │ esc cancel"),
				{ timeoutMs: 3000 }
			);
		} finally {
			result.unmount();
		}
	});

	it("escape from text editor exits without persisting", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 7);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("enter save │ esc cancel"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, "new-key-123");
			await writeInput(result, KEYS.escape);

			expect(onPersistChange).not.toHaveBeenCalled();
			expect(onBack).not.toHaveBeenCalled();
			expect(stripAnsi(result.lastFrame() ?? "")).toContain("Not set");
		} finally {
			result.unmount();
		}
	});

	it("escape in list step invokes onBack", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await writeInput(result, KEYS.escape);
			expect(onBack).toHaveBeenCalledTimes(1);
		} finally {
			result.unmount();
		}
	});

	it("q in list step invokes onQuit", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const onQuit = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
				onQuit={onQuit}
			/>
		);

		try {
			await waitForRender(result);
			await writeInput(result, "q");
			expect(onQuit).toHaveBeenCalledTimes(1);
			expect(onBack).not.toHaveBeenCalled();
		} finally {
			result.unmount();
		}
	});

	it("q in text editor does not invoke onQuit", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const onQuit = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
				onQuit={onQuit}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 7);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("enter save │ esc cancel"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, "q");
			expect(onQuit).not.toHaveBeenCalled();
			expect(stripAnsi(result.lastFrame() ?? "")).toContain("enter save │ esc cancel");
		} finally {
			result.unmount();
		}
	});

	it("pressing s shows auto-save hint and does not persist", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await writeInput(result, "s");
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes(
						"Auto-save is enabled. Changes save automatically."
					),
				{ timeoutMs: 3000 }
			);
			expect(onPersistChange).not.toHaveBeenCalled();
		} finally {
			result.unmount();
		}
	});

	it("select editor persists on arrow change", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 3); // Upscaler
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Editing Upscaler"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.down);
			await waitUntil(() => onPersistChange.mock.calls.length === 1, {
				timeoutMs: 3000,
			});
			expect(onPersistChange.mock.calls[0][0]).toEqual({ upscaler: "crystal" });
			expect(selectedLine(result, "Upscaler")).toContain("crystal");
		} finally {
			result.unmount();
		}
	});

	it("toggle editor persists on arrow change", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 5); // Open After Generate
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes(
						"Editing Open After Generate"
					),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.down);
			await waitUntil(() => onPersistChange.mock.calls.length === 1, {
				timeoutMs: 3000,
			});
			expect(onPersistChange.mock.calls[0][0]).toEqual({
				openAfterGenerate: true,
			});
			expect(selectedLine(result, "Open After Generate")).toContain("Yes");
		} finally {
			result.unmount();
		}
	});

	it("default model editor shows display names", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await writeInput(result, KEYS.enter); // Default Model editor
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Editing Default Model"),
				{ timeoutMs: 3000 }
			);

			const output = stripAnsi(result.lastFrame() ?? "");
			for (const modelKey of GENERATION_MODELS) {
				expect(output).toContain(MODELS[modelKey].name);
				expect(output).not.toContain(`◆ ${modelKey}`);
			}
		} finally {
			result.unmount();
		}
	});

	it("API key submit persists and masks value", async () => {
		const onPersistChange = mock(async () => undefined);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 7);
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("enter save │ esc cancel"),
				{ timeoutMs: 3000 }
			);

			const testKey = "fal-key-abc123";
			for (const char of testKey) {
				await writeInput(result, char);
			}
			await writeInput(result, KEYS.enter);

			await waitUntil(() => onPersistChange.mock.calls.length === 1, {
				timeoutMs: 3000,
			});
			expect(onPersistChange.mock.calls[0][0]).toEqual({ apiKey: testKey });
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("fal-key-...c123"),
				{ timeoutMs: 3000 }
			);
		} finally {
			result.unmount();
		}
	});

	it("shows Saving then Saved status on successful persist", async () => {
		let resolvePersist: (() => void) | undefined;
		const onPersistChange = mock(
			() =>
				new Promise<void>((resolve) => {
					resolvePersist = resolve;
				})
		);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 5);
			await writeInput(result, KEYS.enter);
			await writeInput(result, KEYS.down);

			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Saving..."),
				{ timeoutMs: 3000 }
			);
			resolvePersist?.();
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Saved"),
				{ timeoutMs: 3000 }
			);
		} finally {
			result.unmount();
		}
	});

	it("shows save failure while keeping local value", async () => {
		const onPersistChange = mock(async () => {
			throw new Error("persist failed");
		});
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 5);
			await writeInput(result, KEYS.enter);
			await writeInput(result, KEYS.down);

			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Save failed"),
				{ timeoutMs: 3000 }
			);
			expect(selectedLine(result, "Open After Generate")).toContain("Yes");
		} finally {
			result.unmount();
		}
	});

	it("ignores stale save completions and keeps latest save status", async () => {
		const resolvers: Array<() => void> = [];
		const onPersistChange = mock(
			() =>
				new Promise<void>((resolve) => {
					resolvers.push(resolve);
				})
		);
		const onBack = mock(() => undefined);
		const result = render(
			<SettingsScreen
				config={baseConfig}
				onBack={onBack}
				onPersistChange={onPersistChange}
			/>
		);

		try {
			await waitForRender(result);
			await goToSetting(result, 3); // Upscaler
			await writeInput(result, KEYS.enter);

			await writeInput(result, KEYS.down); // clarity -> crystal
			await writeInput(result, KEYS.up); // crystal -> clarity
			await waitUntil(() => onPersistChange.mock.calls.length === 2, {
				timeoutMs: 3000,
			});

			resolvers[0]?.();
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Saving..."),
				{ timeoutMs: 3000 }
			);
			expect(stripAnsi(result.lastFrame() ?? "")).not.toContain("Saved");

			resolvers[1]?.();
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("Saved"),
				{ timeoutMs: 3000 }
			);

			await writeInput(result, KEYS.enter); // exit editor
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Upscaler"),
				{ timeoutMs: 3000 }
			);
			expect(selectedLine(result, "Upscaler")).toContain("clarity");
		} finally {
			result.unmount();
		}
	});

	it("property: repeated toggle changes persist every change", async () => {
		await fc.assert(
			fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (presses) => {
				const onPersistChange = mock(async () => undefined);
				const onBack = mock(() => undefined);
				const result = render(
					<SettingsScreen
						config={baseConfig}
						onBack={onBack}
						onPersistChange={onPersistChange}
					/>
				);

				try {
					await waitForRender(result);
					await goToSetting(result, 5);
					await writeInput(result, KEYS.enter);

					for (let index = 0; index < presses; index++) {
						await writeInput(result, KEYS.down);
					}

					const expected = presses % 2 === 1 ? "Yes" : "No";
					await waitUntil(
						() => selectedLine(result, "Open After Generate").includes(expected),
						{ timeoutMs: 3000 }
					);
					expect(onPersistChange).toHaveBeenCalledTimes(presses);
				} finally {
					result.unmount();
				}
			}),
			{ numRuns: 10 }
		);
	}, 30_000);
});
