import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import type { FalconConfig, History } from "../../src/studio/deps/config";
import { withMockFetch } from "../helpers/fetch";
import { importWithTimeoutRetry } from "../helpers/import";
import { KEYS, stripAnsi, waitUntil, writeInput } from "../helpers/ink";
import {
	createEmptyStudioHistory,
	registerStudioMocks,
	STUDIO_TEST_CONFIG,
} from "../helpers/studio-mocks";

const { default: fc } = await importWithTimeoutRetry(
	() => import("fast-check"),
	{
		label: "fast-check import (app.test)",
	}
);

let App = null as unknown as typeof import("../../src/studio/app")["App"];
let originalFalKey: string | undefined;

beforeAll(async () => {
	originalFalKey = process.env.FAL_KEY;
	registerStudioMocks();
	process.env.FAL_KEY = "test-key-for-app-tests";
	({ App } = await importWithTimeoutRetry(
		() => import("../../src/studio/app"),
		{
			label: "App import",
		}
	));
});

afterAll(() => {
	if (originalFalKey === undefined) {
		process.env.FAL_KEY = undefined;
	} else {
		process.env.FAL_KEY = originalFalKey;
	}
});

const APP_TEST_TIMEOUT_MS = 15_000;

const baseConfig: FalconConfig = STUDIO_TEST_CONFIG;
const createHistory = (): History => createEmptyStudioHistory();
const hasControlCharacters = (value: string): boolean =>
	Array.from(value).some((char) => {
		const code = char.codePointAt(0) ?? 0;
		return (code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
	});

const renderApp = (history: History = createHistory()) =>
	render(
		<App
			config={baseConfig}
			history={history}
			onConfigChange={async () => undefined}
			onHistoryChange={async () => undefined}
		/>
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
		APP_TEST_TIMEOUT_MS
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
					{ timeoutMs: 3000 }
				);
				const output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Enter your prompt:");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
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
					{ timeoutMs: 3000 }
				);
				let output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Settings");

				await writeInput(result, KEYS.escape);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Generate"),
					{ timeoutMs: 3000 }
				);
				output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Generate");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
	);

	it(
		"stays on settings after a change and returns home on escape",
		async () => {
			const onConfigChange = mock(async () => undefined);
			const result = render(
				<App
					config={baseConfig}
					history={createHistory()}
					onConfigChange={onConfigChange}
					onHistoryChange={async () => undefined}
				/>
			);
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
					{ timeoutMs: 3000 }
				);

				await writeInput(result, KEYS.enter); // Open Default Model editor
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes(
							"Editing Default Model"
						),
					{ timeoutMs: 3000 }
				);
				await writeInput(result, KEYS.down); // Persist change
				await waitUntil(() => onConfigChange.mock.calls.length === 1, {
					timeoutMs: 3000,
				});

				const stillOnSettings = stripAnsi(result.lastFrame() ?? "");
				expect(stillOnSettings).toContain("Settings");
				expect(stillOnSettings).toContain("Default Model");
				expect(stillOnSettings).not.toContain("Create new image from prompt");

				await writeInput(result, KEYS.escape); // Editor -> list
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes(
							"enter edit │ esc back │ q quit │ s auto-save info"
						),
					{ timeoutMs: 3000 }
				);

				await writeInput(result, KEYS.escape); // Settings -> home
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Generate"),
					{ timeoutMs: 3000 }
				);
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
	);

	it(
		"q key exits from home",
		async () => {
			const result = renderApp();
			try {
				await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
					timeoutMs: 3000,
				});
				const output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Generate");

				const _frameCountBeforeQuit = result.frames.length;
				await writeInput(result, "q");
				// Give Ink time to process the exit
				await new Promise((r) => setTimeout(r, 200));
				const frameCountAfterQuit = result.frames.length;

				// After exit, sending more input should not produce new frames
				await writeInput(result, KEYS.down);
				await new Promise((r) => setTimeout(r, 200));
				const frameCountAfterInput = result.frames.length;

				expect(frameCountAfterInput).toBe(frameCountAfterQuit);
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
	);

	it(
		"q key exits from non-home screens",
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
					{ timeoutMs: 3000 }
				);

				await writeInput(result, "q");
				await new Promise((r) => setTimeout(r, 200));
				const frameCountAfterQuit = result.frames.length;
				await writeInput(result, KEYS.down);
				await new Promise((r) => setTimeout(r, 200));
				const frameCountAfterInput = result.frames.length;
				expect(frameCountAfterInput).toBe(frameCountAfterQuit);
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
	);

	it(
		"escape in generate screen follows local step-back before returning home",
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
					{ timeoutMs: 3000 }
				);
				await writeInput(result, "test prompt");
				await writeInput(result, KEYS.enter);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
					{ timeoutMs: 3000 }
				);

				await writeInput(result, KEYS.escape);
				await waitUntil(
					() =>
						stripAnsi(result.lastFrame() ?? "").includes("Enter your prompt:"),
					{ timeoutMs: 3000 }
				);
				expect(stripAnsi(result.lastFrame() ?? "")).toContain(
					"Enter your prompt:"
				);

				await writeInput(result, KEYS.escape);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Generate"),
					{ timeoutMs: 3000 }
				);
				expect(stripAnsi(result.lastFrame() ?? "")).toContain("Generate");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
	);

	it(
		"displays error banner when generation fails",
		async () => {
			const errorFetchImpl = (input: RequestInfo | URL) => {
				const url = input.toString();
				// Return pricing responses normally
				if (url.includes("/pricing") || url.includes("/models/pricing")) {
					return Response.json({ total_cost: 0.1, currency: "USD" });
				}
				// Generation request throws an error
				throw new Error("API connection failed");
			};

			await withMockFetch(errorFetchImpl, async () => {
				const result = renderApp();
				try {
					// Wait for home screen
					await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
						timeoutMs: 3000,
					});

					// Navigate to generate screen (first menu item)
					await writeInput(result, KEYS.enter);
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes(
								"Enter your prompt:"
							),
						{ timeoutMs: 3000 }
					);

					// Type a prompt and submit
					await writeInput(result, "test prompt");
					await writeInput(result, KEYS.enter);

					// Wait for preset step
					await waitUntil(
						() => stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
						{ timeoutMs: 3000 }
					);

					// Select first preset to go to confirm step
					await writeInput(result, KEYS.enter);
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes("Ready to generate"),
						{ timeoutMs: 3000 }
					);

					// Press 'y' to trigger generation (which will fail)
					await writeInput(result, "y");

					// Wait for error banner to appear — after failure, App shows error and returns to home
					await waitUntil(
						() =>
							stripAnsi(result.lastFrame() ?? "").includes(
								"API connection failed"
							),
						{ timeoutMs: 5000 }
					);

					const output = stripAnsi(result.lastFrame() ?? "");
					expect(output).toContain("✗ API connection failed");
				} finally {
					result.unmount();
				}
			});
		},
		APP_TEST_TIMEOUT_MS
	);

	it(
		"renders cost footer with actual cost data",
		async () => {
			const historyWithCosts = createHistory();
			historyWithCosts.totalCost = {
				USD: { session: 0.15, today: 1.5, allTime: 25 },
			};

			const result = renderApp(historyWithCosts);
			try {
				await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
					timeoutMs: 3000,
				});
				const output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("USD $0.15 session");
				expect(output).toContain("USD $1.50 today");
				expect(output).toContain("USD $25.00 total");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
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
					{ timeoutMs: 3000 }
				);
				let output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("No generations yet");

				await writeInput(result, KEYS.escape);
				await waitUntil(
					() => stripAnsi(result.lastFrame() ?? "").includes("Generate"),
					{ timeoutMs: 3000 }
				);
				output = stripAnsi(result.lastFrame() ?? "");
				expect(output).toContain("Generate");
			} finally {
				result.unmount();
			}
		},
		APP_TEST_TIMEOUT_MS
	);

	/**
	 * Feature: phase4-studio-ui-tests, Property 2: Cost footer rendering
	 * **Validates: Requirements 1.3**
	 *
	 * For any set of cost values (session, today, allTime), when Studio_App
	 * renders with history containing those cost values, the footer should
	 * contain the formatted session, today, and allTime amounts with the
	 * correct currency prefix.
	 */
	it("property: cost footer rendering — any cost values are formatted correctly in the footer", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.float({ min: 0, max: 999, noNaN: true }),
				fc.float({ min: 0, max: 999, noNaN: true }),
				fc.float({ min: 0, max: 999, noNaN: true }),
				async (session, today, allTime) => {
					const history = createHistory();
					history.totalCost = {
						USD: { session, today, allTime },
					};

					const result = renderApp(history);
					try {
						await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
							timeoutMs: 3000,
						});
						const output = stripAnsi(result.lastFrame() ?? "");
						expect(output).toContain(`USD $${session.toFixed(2)} session`);
						expect(output).toContain(`USD $${today.toFixed(2)} today`);
						expect(output).toContain(`USD $${allTime.toFixed(2)} total`);
					} finally {
						result.unmount();
					}
				}
			),
			{ numRuns: 10 }
		);
	}, 60_000);

	/**
	 * Feature: phase4-studio-ui-tests, Property 1: Error message display
	 * **Validates: Requirements 1.2**
	 *
	 * For any non-empty error message string, when the error is triggered via
	 * Studio_App's handleError mechanism, the rendered frame should contain
	 * that error message text.
	 */
	it("property: error message display — any non-empty error message appears in the UI", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 80 }).filter(
					(s) =>
						s.trim().length > 0 &&
						s === s.trim() &&
						// Filter out strings with ANSI escape sequences or control chars
						// that could interfere with rendering/stripping
						!hasControlCharacters(s)
				),
				async (errorMessage) => {
					const errorFetchImpl = (input: RequestInfo | URL) => {
						const url = input.toString();
						if (url.includes("/pricing") || url.includes("/models/pricing")) {
							return Response.json({
								total_cost: 0.1,
								currency: "USD",
							});
						}
						throw new Error(errorMessage);
					};

					await withMockFetch(errorFetchImpl, async () => {
						const result = renderApp();
						try {
							// Wait for home screen
							await waitUntil(() => (result.lastFrame() ?? "").length > 0, {
								timeoutMs: 5000,
							});

							// Navigate to generate screen
							await writeInput(result, KEYS.enter);
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										"Enter your prompt:"
									),
								{ timeoutMs: 5000 }
							);

							// Type a prompt and submit
							await writeInput(result, "test prompt");
							await writeInput(result, KEYS.enter);

							// Wait for preset step
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes("Quick presets"),
								{ timeoutMs: 5000 }
							);

							// Select first preset to go to confirm step
							await writeInput(result, KEYS.enter);
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(
										"Ready to generate"
									),
								{ timeoutMs: 5000 }
							);

							// Press 'y' to trigger generation (which will fail)
							await writeInput(result, "y");

							// Wait for error banner to appear
							await waitUntil(
								() =>
									stripAnsi(result.lastFrame() ?? "").includes(errorMessage),
								{ timeoutMs: 7000 }
							);

							const output = stripAnsi(result.lastFrame() ?? "");
							expect(output).toContain(`✗ ${errorMessage}`);
						} finally {
							result.unmount();
						}
					});
				}
			),
			{ numRuns: 10 }
		);
	}, 60_000);
});
