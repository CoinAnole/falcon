import "../helpers/env";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addGeneration,
	FALCON_DIR,
	getApiKey,
	loadConfig,
	loadHistory,
	saveConfig,
	saveHistory,
} from "../../src/utils/config";

const baseCwd = process.cwd();
let originalKey: string | undefined;

function resetFalconDir(): void {
	rmSync(FALCON_DIR, { recursive: true, force: true });
}

beforeEach(() => {
	originalKey = process.env.FAL_KEY;
	delete process.env.FAL_KEY;
	resetFalconDir();
	process.chdir(baseCwd);
});

afterEach(() => {
	if (originalKey !== undefined) {
		process.env.FAL_KEY = originalKey;
	} else {
		delete process.env.FAL_KEY;
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
			JSON.stringify({ defaultModel: "gemini" }, null, 2),
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
