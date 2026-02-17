import "../helpers/env";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importWithTimeoutRetry } from "../helpers/import";

const { default: fc } = await importWithTimeoutRetry(
	() => import("fast-check"),
	{
		label: "fast-check import (config.test)",
	}
);

const {
	addGeneration,
	CONFIG_PATH,
	FALCON_DIR,
	generateId,
	getApiKey,
	HISTORY_PATH,
	loadConfig,
	loadHistory,
	saveConfig,
	saveHistory,
} = await importWithTimeoutRetry(() => import("../../src/utils/config"), {
	label: "utils/config import (config.test)",
});

const baseCwd = process.cwd();
let originalKey: string | undefined;

function resetFalconDir(): void {
	rmSync(FALCON_DIR, { recursive: true, force: true });
}

beforeEach(() => {
	originalKey = process.env.FAL_KEY;
	process.env.FAL_KEY = undefined;
	resetFalconDir();
	process.chdir(baseCwd);
});

afterEach(() => {
	if (originalKey !== undefined) {
		process.env.FAL_KEY = originalKey;
	} else {
		process.env.FAL_KEY = undefined;
	}
	process.chdir(baseCwd);
});

describe("config", () => {
	it("loads defaults when config files are missing", async () => {
		const config = await loadConfig();
		expect(config.defaultModel).toBe("banana");
		expect(config.defaultAspect).toBe("1:1");
		expect(config.defaultResolution).toBe("2K");
		expect(config.openAfterGenerate).toBe(true);
	});

	it("prefers local .falconrc over global config", async () => {
		await saveConfig({ defaultModel: "gpt" });
		const tempDir = mkdtempSync(join(tmpdir(), "falcon-cwd-"));
		writeFileSync(
			join(tempDir, ".falconrc"),
			JSON.stringify({ defaultModel: "gemini" }, null, 2)
		);
		process.chdir(tempDir);

		try {
			const config = await loadConfig();
			expect(config.defaultModel).toBe("gemini");
		} finally {
			process.chdir(baseCwd);
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("merges config updates on save", async () => {
		await saveConfig({ defaultModel: "gpt" });
		await saveConfig({ defaultAspect: "16:9" });

		const config = await loadConfig();
		expect(config.defaultModel).toBe("gpt");
		expect(config.defaultAspect).toBe("16:9");
	});

	it("resets session totals on a new day", async () => {
		const history = {
			generations: [],
			totalCost: {
				USD: { session: 5, today: 10, allTime: 20 },
			},
			lastSessionDate: "2000-01-01",
		};

		await saveHistory(history);
		const loaded = await loadHistory();
		expect(loaded.totalCost.USD.session).toBe(0);
		expect(loaded.totalCost.USD.today).toBe(0);
		expect(loaded.totalCost.USD.allTime).toBe(20);
	});

	it("trims history and updates totals when adding generations", async () => {
		const today = new Date().toISOString().split("T")[0];
		const history = {
			generations: Array.from({ length: 100 }, (_, index) => ({
				id: `g${index}`,
				prompt: `prompt-${index}`,
				model: "banana",
				aspect: "1:1" as const,
				resolution: "2K" as const,
				output: `output-${index}.png`,
				cost: 0.1,
				timestamp: new Date().toISOString(),
			})),
			totalCost: {
				USD: { session: 0, today: 0, allTime: 0 },
			},
			lastSessionDate: today,
		};

		await saveHistory(history);
		await addGeneration({
			id: "g100",
			prompt: "prompt-100",
			model: "banana",
			aspect: "1:1",
			resolution: "2K",
			output: "output-100.png",
			cost: 0.25,
			costDetails: {
				currency: "USD",
				estimateType: "unit_price",
				estimateSource: "fallback",
				endpointId: "fal-ai/nano-banana-pro",
			},
			timestamp: new Date().toISOString(),
		});

		const updated = await loadHistory();
		expect(updated.generations).toHaveLength(100);
		expect(updated.generations[0]?.id).toBe("g1");
		expect(updated.generations[99]?.id).toBe("g100");
		expect(updated.totalCost.USD.session).toBeCloseTo(0.25);
		expect(updated.totalCost.USD.today).toBeCloseTo(0.25);
		expect(updated.totalCost.USD.allTime).toBeCloseTo(0.25);
	});

	it("prefers FAL_KEY environment variable", () => {
		process.env.FAL_KEY = "env-key";
		const key = getApiKey({
			defaultModel: "banana",
			defaultAspect: "1:1",
			defaultResolution: "2K",
			openAfterGenerate: true,
			upscaler: "clarity",
			backgroundRemover: "rmbg",
		});
		expect(key).toBe("env-key");
	});
});

describe("corrupted config files", () => {
	it("falls back to defaults when global config contains invalid JSON", async () => {
		mkdirSync(FALCON_DIR, { recursive: true });
		writeFileSync(CONFIG_PATH, "{{not valid json!!");

		const config = await loadConfig();
		expect(config.defaultModel).toBe("banana");
		expect(config.defaultAspect).toBe("1:1");
		expect(config.defaultResolution).toBe("2K");
		expect(config.openAfterGenerate).toBe(true);
	});

	it("ignores corrupted local .falconrc and uses global config", async () => {
		await saveConfig({ defaultModel: "gpt" });

		const tempDir = mkdtempSync(join(tmpdir(), "falcon-cwd-"));
		writeFileSync(join(tempDir, ".falconrc"), "{{broken json!!");
		process.chdir(tempDir);

		try {
			const config = await loadConfig();
			expect(config.defaultModel).toBe("gpt");
		} finally {
			process.chdir(baseCwd);
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("returns default history when history file contains invalid JSON", async () => {
		mkdirSync(FALCON_DIR, { recursive: true });
		writeFileSync(HISTORY_PATH, "not json at all");

		const history = await loadHistory();
		expect(history.generations).toEqual([]);
		expect(history.totalCost.USD).toBeDefined();
		expect(history.totalCost.USD.allTime).toBe(0);
	});

	it("saveConfig overwrites corrupted existing config with merged defaults", async () => {
		mkdirSync(FALCON_DIR, { recursive: true });
		writeFileSync(CONFIG_PATH, "{{corrupted!!");

		await saveConfig({ defaultModel: "gemini" });

		const config = await loadConfig();
		expect(config.defaultModel).toBe("gemini");
		expect(config.defaultAspect).toBe("1:1");
		expect(config.defaultResolution).toBe("2K");
	});
});

describe("legacy totalCost migration", () => {
	it("converts flat totalCost to multi-currency format under USD", async () => {
		mkdirSync(FALCON_DIR, { recursive: true });
		// Write legacy format with flat totalCost — lastSessionDate is old so session/today reset
		writeFileSync(
			HISTORY_PATH,
			JSON.stringify({
				generations: [],
				totalCost: { session: 5, today: 10, allTime: 50 },
				lastSessionDate: "2000-01-01",
			})
		);

		const history = await loadHistory();
		expect(history.totalCost.USD).toBeDefined();
		expect(history.totalCost.USD.allTime).toBe(50);
		// session and today reset because lastSessionDate is old
		expect(history.totalCost.USD.session).toBe(0);
		expect(history.totalCost.USD.today).toBe(0);
	});

	it("preserves zero values in legacy format under USD", async () => {
		mkdirSync(FALCON_DIR, { recursive: true });
		writeFileSync(
			HISTORY_PATH,
			JSON.stringify({
				generations: [],
				totalCost: { session: 0, today: 0, allTime: 0 },
				lastSessionDate: "2000-01-01",
			})
		);

		const history = await loadHistory();
		expect(history.totalCost.USD).toBeDefined();
		expect(history.totalCost.USD.allTime).toBe(0);
		expect(history.totalCost.USD.session).toBe(0);
		expect(history.totalCost.USD.today).toBe(0);
	});

	// Feature: phase5-config-integration-tests, Property 1: Legacy cost migration preserves allTime under USD
	// Validates: Requirements 2.1
	it("property: legacy cost migration preserves allTime under USD", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.float({ min: 0, max: 10_000, noNaN: true }),
				fc.float({ min: 0, max: 10_000, noNaN: true }),
				fc.float({ min: 0, max: 10_000, noNaN: true }),
				async (session, today, allTime) => {
					resetFalconDir();
					mkdirSync(FALCON_DIR, { recursive: true });
					writeFileSync(
						HISTORY_PATH,
						JSON.stringify({
							generations: [],
							totalCost: { session, today, allTime },
							lastSessionDate: "2000-01-01",
						})
					);

					const history = await loadHistory();
					expect(history.totalCost.USD).toBeDefined();
					expect(history.totalCost.USD.allTime).toBe(allTime || 0);
				}
			),
			{ numRuns: 50 }
		);
	});
});

describe("multi-currency cost tracking", () => {
	it("creates EUR entry when addGeneration uses EUR currency", async () => {
		const today = new Date().toISOString().split("T")[0];
		await saveHistory({
			generations: [],
			totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
			lastSessionDate: today,
		});

		await addGeneration({
			id: "eur-1",
			prompt: "test",
			model: "banana",
			aspect: "1:1",
			resolution: "2K",
			output: "out.png",
			cost: 0.05,
			costDetails: {
				currency: "EUR",
				estimateType: "unit_price",
				estimateSource: "fallback",
				endpointId: "fal-ai/nano-banana-pro",
			},
			timestamp: new Date().toISOString(),
		});

		const history = await loadHistory();
		expect(history.totalCost.EUR).toBeDefined();
		expect(history.totalCost.EUR.allTime).toBeCloseTo(0.05);
	});

	it("tracks USD and EUR costs independently", async () => {
		const today = new Date().toISOString().split("T")[0];
		await saveHistory({
			generations: [],
			totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
			lastSessionDate: today,
		});

		await addGeneration({
			id: "usd-1",
			prompt: "test",
			model: "banana",
			aspect: "1:1",
			resolution: "2K",
			output: "out1.png",
			cost: 0.1,
			costDetails: {
				currency: "USD",
				estimateType: "unit_price",
				estimateSource: "fallback",
				endpointId: "fal-ai/nano-banana-pro",
			},
			timestamp: new Date().toISOString(),
		});

		await addGeneration({
			id: "eur-1",
			prompt: "test",
			model: "banana",
			aspect: "1:1",
			resolution: "2K",
			output: "out2.png",
			cost: 0.2,
			costDetails: {
				currency: "EUR",
				estimateType: "unit_price",
				estimateSource: "fallback",
				endpointId: "fal-ai/nano-banana-pro",
			},
			timestamp: new Date().toISOString(),
		});

		const history = await loadHistory();
		expect(history.totalCost.USD.allTime).toBeCloseTo(0.1);
		expect(history.totalCost.EUR.allTime).toBeCloseTo(0.2);
	});

	it("defaults to USD when costDetails is missing", async () => {
		const today = new Date().toISOString().split("T")[0];
		await saveHistory({
			generations: [],
			totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
			lastSessionDate: today,
		});

		await addGeneration({
			id: "no-cost-details",
			prompt: "test",
			model: "banana",
			aspect: "1:1",
			resolution: "2K",
			output: "out.png",
			cost: 0.15,
			timestamp: new Date().toISOString(),
		});

		const history = await loadHistory();
		expect(history.totalCost.USD.allTime).toBeCloseTo(0.15);
	});

	// Feature: phase5-config-integration-tests, Property 2: Multi-currency cost accumulation
	// Validates: Requirements 3.1, 3.2
	it("property: multi-currency cost accumulation", async () => {
		const currencies = ["USD", "EUR", "GBP", "JPY"];

		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						currency: fc.constantFrom(...currencies),
						cost: fc.float({
							min: Math.fround(0.01),
							max: Math.fround(100),
							noNaN: true,
						}),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				async (generations) => {
					resetFalconDir();
					const today = new Date().toISOString().split("T")[0];
					await saveHistory({
						generations: [],
						totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
						lastSessionDate: today,
					});

					// Expected totals per currency
					const expected: Record<string, number> = {};
					for (const gen of generations) {
						expected[gen.currency] = (expected[gen.currency] || 0) + gen.cost;
					}

					// Add all generations
					for (let i = 0; i < generations.length; i++) {
						const gen = generations[i];
						await addGeneration({
							id: `gen-${i}`,
							prompt: "test",
							model: "banana",
							aspect: "1:1",
							resolution: "2K",
							output: `out-${i}.png`,
							cost: gen.cost,
							costDetails: {
								currency: gen.currency,
								estimateType: "unit_price",
								estimateSource: "fallback",
								endpointId: "fal-ai/nano-banana-pro",
							},
							timestamp: new Date().toISOString(),
						});
					}

					const history = await loadHistory();
					for (const [currency, total] of Object.entries(expected)) {
						expect(history.totalCost[currency]).toBeDefined();
						expect(history.totalCost[currency].allTime).toBeCloseTo(total, 1);
					}
				}
			),
			{ numRuns: 50 }
		);
	});
});

const UUID_V4_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("generateId", () => {
	it("returns unique values across multiple calls", () => {
		const ids = Array.from({ length: 10 }, () => generateId());
		const unique = new Set(ids);
		expect(unique.size).toBe(10);
	});

	it("returns values matching UUID v4 format", () => {
		for (let i = 0; i < 5; i++) {
			expect(generateId()).toMatch(UUID_V4_REGEX);
		}
	});

	// Feature: phase5-config-integration-tests, Property 3: generateId uniqueness and UUID format
	// Validates: Requirements 4.1, 4.2
	it("property: generateId uniqueness and UUID format", () => {
		fc.assert(
			fc.property(fc.integer({ min: 2, max: 50 }), (batchSize) => {
				const ids = Array.from({ length: batchSize }, () => generateId());
				const unique = new Set(ids);
				expect(unique.size).toBe(batchSize);
				for (const id of ids) {
					expect(id).toMatch(UUID_V4_REGEX);
				}
			}),
			{ numRuns: 50 }
		);
	});
});
