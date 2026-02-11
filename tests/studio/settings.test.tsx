import { describe, expect, it, mock } from "bun:test";
import fc from "fast-check";
import { render } from "ink-testing-library";
import { GENERATION_MODELS, MODELS } from "../../src/api/models";
import type { FalconConfig } from "../../src/studio/deps/config";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";

const { SettingsScreen } = await import("../../src/studio/screens/Settings");

const baseConfig: FalconConfig = {
	defaultModel: "banana",
	defaultAspect: "1:1",
	defaultResolution: "2K",
	openAfterGenerate: false,
	upscaler: "clarity",
	backgroundRemover: "rmbg",
	promptExpansion: false,
};

describe("settings screen", () => {
	it("renders all 8 setting items with current values", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			const output = stripAnsi(result.lastFrame() ?? "");
			// All 8 labels
			expect(output).toContain("Default Model");
			expect(output).toContain("Default Aspect");
			expect(output).toContain("Default Resolution");
			expect(output).toContain("Upscaler");
			expect(output).toContain("Background Remover");
			expect(output).toContain("Open After Generate");
			expect(output).toContain("Prompt Expansion");
			expect(output).toContain("API Key");
			// Current values
			expect(output).toContain("Nano Banana Pro");
			expect(output).toContain("1:1");
			expect(output).toContain("2K");
			expect(output).toContain("clarity");
			expect(output).toContain("rmbg");
			expect(output).toContain("No"); // openAfterGenerate=false and promptExpansion=false
			expect(output).toContain("Not set"); // apiKey undefined
		} finally {
			result.unmount();
		}
	});

	it("up/down arrow navigation with wrapping", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 5000 },
			);
			// Down moves to next
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Aspect"),
				{ timeoutMs: 3000 },
			);
			// Up on first item wraps to last (API Key)
			await writeInput(result, KEYS.up);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.up);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ API Key"),
				{ timeoutMs: 3000 },
			);
			// Down on last item wraps to first
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 },
			);
		} finally {
			result.unmount();
		}
	});

	it("enter on API Key text setting enters editing mode", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 },
			);
			// Navigate to API Key (index 7, so 7 downs from index 0)
			for (let i = 0; i < 7; i++) {
				await writeInput(result, KEYS.down);
			}
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ API Key"),
				{ timeoutMs: 3000 },
			);
			// Before enter, "Not set" is shown
			let output = stripAnsi(result.lastFrame() ?? "");
			expect(output).toContain("Not set");
			// Press enter to start editing
			await writeInput(result, KEYS.enter);
			// After entering edit mode, "Not set" should no longer appear for API Key
			// The TextInput component replaces the static text
			await waitUntil(
				() => !stripAnsi(result.lastFrame() ?? "").includes("Not set"),
				{ timeoutMs: 3000 },
			);
			output = stripAnsi(result.lastFrame() ?? "");
			// In editing mode, the "Not set" text is replaced by the TextInput
			expect(output).not.toContain("Not set");
		} finally {
			result.unmount();
		}
	});

	it("escape from text editing mode exits without saving", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const configWithKey: FalconConfig = {
			...baseConfig,
			apiKey: "test-key-12345678",
		};
		const result = render(
			<SettingsScreen config={configWithKey} onSave={onSave} onBack={onBack} />,
		);
		try {
			await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
				timeoutMs: 3000,
			});
			// Navigate to API Key
			for (let i = 0; i < 7; i++) {
				await writeInput(result, KEYS.down);
			}
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ API Key"),
				{ timeoutMs: 3000 },
			);
			// Enter editing mode
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					// The masked value (test-key-12345678) should no longer show as masked display
					return frame.includes("◆ API Key") && !frame.includes("test-key-");
				},
				{ timeoutMs: 3000 },
			);
			// Press escape to exit editing without saving
			await writeInput(result, KEYS.escape);
			// onBack should NOT have been called (escape exits editing, not the screen)
			expect(onBack).not.toHaveBeenCalled();
			// The original masked value should be restored
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("test-key...5678");
				},
				{ timeoutMs: 3000 },
			);
		} finally {
			result.unmount();
		}
	});

	it("escape while not editing invokes onBack", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
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

	it("Default Aspect cycling shows valid aspect ratio strings", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 },
			);

			// Navigate to Default Aspect (index 1)
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Aspect"),
				{ timeoutMs: 3000 },
			);

			// Initial value should be "1:1"
			let output = stripAnsi(result.lastFrame() ?? "");
			const selectedLine = output
				.split("\n")
				.find((l) => l.includes("◆ Default Aspect"));
			expect(selectedLine).toContain("1:1");

			// Press enter to cycle to next aspect ratio
			// ASPECT_RATIOS order: 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 4:5, 5:4, 21:9
			// 1:1 is at index 0, so next is 4:3
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					const line = frame
						.split("\n")
						.find((l) => l.includes("◆ Default Aspect"));
					return line?.includes("4:3") ?? false;
				},
				{ timeoutMs: 3000 },
			);

			output = stripAnsi(result.lastFrame() ?? "");
			const updatedLine = output
				.split("\n")
				.find((l) => l.includes("◆ Default Aspect"));
			expect(updatedLine).toContain("4:3");
		} finally {
			result.unmount();
		}
	});

	it("Default Resolution cycling shows valid resolution strings", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 },
			);

			// Navigate to Default Resolution (index 2)
			await writeInput(result, KEYS.down);
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Aspect"),
				{ timeoutMs: 3000 },
			);
			await writeInput(result, KEYS.down);
			await waitUntil(
				() =>
					stripAnsi(result.lastFrame() ?? "").includes("◆ Default Resolution"),
				{ timeoutMs: 3000 },
			);

			// Initial value should be "2K"
			let output = stripAnsi(result.lastFrame() ?? "");
			const selectedLine = output
				.split("\n")
				.find((l) => l.includes("◆ Default Resolution"));
			expect(selectedLine).toContain("2K");

			// Press enter to cycle to next resolution
			// RESOLUTIONS order starts with: 1K, 2K, 4K
			// 2K is at index 1, so next is 4K
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					const line = frame
						.split("\n")
						.find((l) => l.includes("◆ Default Resolution"));
					return line?.includes("4K") ?? false;
				},
				{ timeoutMs: 3000 },
			);

			output = stripAnsi(result.lastFrame() ?? "");
			const updatedLine = output
				.split("\n")
				.find((l) => l.includes("◆ Default Resolution"));
			expect(updatedLine).toContain("4K");
		} finally {
			result.unmount();
		}
	});

	it("Default Model cycling shows display names not keys", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
		try {
			const validDisplayNames = GENERATION_MODELS.map(
				(key) => MODELS[key].name,
			);
			const selectedModelLine = () =>
				stripAnsi(result.lastFrame() ?? "")
					.split("\n")
					.find((line) => line.includes("◆ Default Model")) ?? "";

			// Wait for render with Default Model selected (index 0)
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 5000 },
			);

			const initialLine = selectedModelLine();
			const initialValue = initialLine
				.replace(/^.*◆ Default Model\s+/, "")
				.trim();
			expect(initialValue).toBe(MODELS[baseConfig.defaultModel].name);
			expect(GENERATION_MODELS).not.toContain(initialValue);
			expect(validDisplayNames).toContain(initialValue);

			// Press enter to cycle to next model
			await writeInput(result, KEYS.enter);

			// After cycling, selected model value should change and still be a display name.
			await waitUntil(() => selectedModelLine() !== initialLine, {
				timeoutMs: 5000,
			});

			const firstCycledLine = selectedModelLine();
			const firstCycledValue = firstCycledLine
				.replace(/^.*◆ Default Model\s+/, "")
				.trim();
			expect(GENERATION_MODELS).not.toContain(firstCycledValue);
			expect(validDisplayNames).toContain(firstCycledValue);
			expect(firstCycledValue).not.toBe(initialValue);

			// Press enter again to cycle again.
			await writeInput(result, KEYS.enter);
			await waitUntil(() => selectedModelLine() !== firstCycledLine, {
				timeoutMs: 5000,
			});

			const secondCycledLine = selectedModelLine();
			const secondCycledValue = secondCycledLine
				.replace(/^.*◆ Default Model\s+/, "")
				.trim();
			expect(GENERATION_MODELS).not.toContain(secondCycledValue);
			expect(validDisplayNames).toContain(secondCycledValue);
			expect(secondCycledValue).not.toBe(firstCycledValue);
		} finally {
			result.unmount();
		}
	});

	it("API key text input submission saves new key", async () => {
		const onSave = mock(async () => {});
		const onBack = mock(() => {});
		const result = render(
			<SettingsScreen config={baseConfig} onSave={onSave} onBack={onBack} />,
		);
		try {
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ Default Model"),
				{ timeoutMs: 3000 },
			);
			// Navigate to API Key (index 7)
			for (let i = 0; i < 7; i++) {
				await writeInput(result, KEYS.down);
			}
			await waitUntil(
				() => stripAnsi(result.lastFrame() ?? "").includes("◆ API Key"),
				{ timeoutMs: 3000 },
			);
			// Press enter to enter edit mode
			await writeInput(result, KEYS.enter);
			await waitUntil(
				() => !stripAnsi(result.lastFrame() ?? "").includes("Not set"),
				{ timeoutMs: 3000 },
			);
			// Type a key value
			const testKey = "fal-key-abc123";
			for (const char of testKey) {
				await writeInput(result, char);
			}
			// Press enter to submit the text input
			await writeInput(result, KEYS.enter);
			// Wait for edit mode to exit (masked value should appear)
			await waitUntil(
				() => {
					const frame = stripAnsi(result.lastFrame() ?? "");
					return frame.includes("fal-key-...c123");
				},
				{ timeoutMs: 3000 },
			);
			// Press 's' to save
			await writeInput(result, "s");
			expect(onSave).toHaveBeenCalledTimes(1);
			const savedConfig = onSave.mock.calls[0][0] as FalconConfig;
			expect(savedConfig.apiKey).toBe(testKey);
		} finally {
			result.unmount();
		}
	});

	// Feature: studio-ui-tests, Property 6: Settings toggle flips value
	// **Validates: Requirements 5.3**
	it("property: toggle flips value", async () => {
		const toggleIndices = [5, 6]; // Open After Generate, Prompt Expansion

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...toggleIndices),
				fc.integer({ min: 1, max: 5 }),
				async (settingIndex, pressCount) => {
					const onSave = mock(async () => {});
					const onBack = mock(() => {});
					const result = render(
						<SettingsScreen
							config={baseConfig}
							onSave={onSave}
							onBack={onBack}
						/>,
					);
					try {
						await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
							timeoutMs: 3000,
						});
						// Navigate to the toggle setting
						for (let i = 0; i < settingIndex; i++) {
							await writeInput(result, KEYS.down);
						}
						// Initial value is "No" (both toggles are false in baseConfig)
						const initialValue = false;
						// Press enter pressCount times to toggle
						for (let i = 0; i < pressCount; i++) {
							await writeInput(result, KEYS.enter);
						}
						// After odd presses: flipped; after even presses: same as initial
						const expectedValue =
							pressCount % 2 === 1 ? !initialValue : initialValue;
						const expectedText = expectedValue ? "Yes" : "No";
						await waitUntil(
							() => {
								const frame = stripAnsi(result.lastFrame() ?? "");
								const lines = frame.split("\n");
								const selectedLine = lines.find((l) => l.includes("◆"));
								return selectedLine?.includes(expectedText) ?? false;
							},
							{ timeoutMs: 3000 },
						);
					} finally {
						result.unmount();
					}
				},
			),
			{ numRuns: 10 },
		);
	}, 30_000);

	// Feature: studio-ui-tests, Property 7: Settings select cycles options
	// **Validates: Requirements 5.4**
	it("property: select cycles options", async () => {
		// Use simpler select settings (Upscaler and Background Remover) where
		// displayed value matches the option key directly
		const selectSettings = [
			{
				index: 3,
				options: ["clarity", "crystal"],
				initial: "clarity",
			},
			{ index: 4, options: ["rmbg", "bria"], initial: "rmbg" },
		];

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...selectSettings),
				fc.integer({ min: 1, max: 5 }),
				async (setting, pressCount) => {
					const onSave = mock(async () => {});
					const onBack = mock(() => {});
					const result = render(
						<SettingsScreen
							config={baseConfig}
							onSave={onSave}
							onBack={onBack}
						/>,
					);
					try {
						await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
							timeoutMs: 3000,
						});
						// Navigate to the setting
						for (let i = 0; i < setting.index; i++) {
							await writeInput(result, KEYS.down);
						}
						// Press enter pressCount times to cycle
						for (let i = 0; i < pressCount; i++) {
							await writeInput(result, KEYS.enter);
						}
						// Calculate expected option
						const initialIdx = setting.options.indexOf(setting.initial);
						const expectedIdx =
							(initialIdx + pressCount) % setting.options.length;
						const expectedOption = setting.options[expectedIdx];
						await waitUntil(
							() => {
								const frame = stripAnsi(result.lastFrame() ?? "");
								const lines = frame.split("\n");
								const selectedLine = lines.find((l) => l.includes("◆"));
								return selectedLine?.includes(expectedOption) ?? false;
							},
							{ timeoutMs: 3000 },
						);
					} finally {
						result.unmount();
					}
				},
			),
			{ numRuns: 10 },
		);
	}, 30_000);

	// Feature: studio-ui-tests, Property 8: Settings save captures current state
	// **Validates: Requirements 5.7**
	it("property: save captures current state after modifications", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 0, max: 3 }),
				async (togglePresses) => {
					const onSave = mock(async () => {});
					const onBack = mock(() => {});
					const result = render(
						<SettingsScreen
							config={baseConfig}
							onSave={onSave}
							onBack={onBack}
						/>,
					);
					try {
						await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
							timeoutMs: 3000,
						});
						// Navigate to "Open After Generate" (index 5) and toggle it
						for (let i = 0; i < 5; i++) {
							await writeInput(result, KEYS.down);
						}
						for (let i = 0; i < togglePresses; i++) {
							await writeInput(result, KEYS.enter);
						}
						// Press 's' to save
						await writeInput(result, "s");
						expect(onSave).toHaveBeenCalledTimes(1);
						const savedConfig = onSave.mock.calls[0][0] as FalconConfig;
						// After togglePresses toggles, the value should be flipped if odd
						const expectedValue = togglePresses % 2 === 1;
						expect(savedConfig.openAfterGenerate).toBe(expectedValue);
						// Other values should remain unchanged
						expect(savedConfig.defaultModel).toBe("banana");
						expect(savedConfig.defaultAspect).toBe("1:1");
					} finally {
						result.unmount();
					}
				},
			),
			{ numRuns: 10 },
		);
	}, 30_000);
});
