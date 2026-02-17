import { describe, expect, it } from "bun:test";
import type { AspectRatio, CliResolution } from "../../src/api/models";
import { importWithTimeoutRetry } from "../helpers/import";

const {
	ASPECT_RATIOS,
	aspectToFlux2Size,
	aspectToGptSize,
	estimateCost,
	GENERATION_MODELS,
	getAspectRatiosForModel,
	UTILITY_MODELS,
} = await importWithTimeoutRetry(() => import("../../src/api/models"), {
	label: "api/models import (models.test)",
});

describe("models", () => {
	it("maps GPT aspect ratios to image sizes", () => {
		expect(aspectToGptSize("9:16")).toBe("1024x1536");
		expect(aspectToGptSize("16:9")).toBe("1536x1024");
		expect(aspectToGptSize("1:1")).toBe("1024x1024");
	});

	it("maps Flux 2 aspect ratios to image size enums", () => {
		expect(aspectToFlux2Size("1:1")).toBe("square_hd");
		expect(aspectToFlux2Size("21:9")).toBe("21:9_2560x1088");
	});

	it("estimates cost based on model and resolution", () => {
		expect(estimateCost("banana", "2K", 2)).toBeCloseTo(0.3);
		expect(estimateCost("banana", "4K", 1)).toBeCloseTo(0.3);
	});

	it("returns model-specific aspect ratios when configured", () => {
		const ratios = getAspectRatiosForModel("imagine");
		expect(ratios).toContain("20:9");
		expect(ratios).toContain("1:2");
	});

	it("falls back to common aspect ratios for unknown models", () => {
		const ratios = getAspectRatiosForModel("unknown");
		expect(ratios).toEqual(ASPECT_RATIOS);
	});
});

// --- Task 5.1: aspectToGptSize full coverage ---
// Requirements: 4.1, 4.2, 4.3
describe("aspectToGptSize — full coverage", () => {
	const portraitRatios: AspectRatio[] = ["9:16", "2:3", "4:5", "3:4"];
	const landscapeRatios: AspectRatio[] = ["16:9", "3:2", "5:4", "4:3", "21:9"];

	it("returns 1024x1536 for all portrait ratios", () => {
		for (const ratio of portraitRatios) {
			expect(aspectToGptSize(ratio)).toBe("1024x1536");
		}
	});

	it("returns 1536x1024 for all landscape ratios", () => {
		for (const ratio of landscapeRatios) {
			expect(aspectToGptSize(ratio)).toBe("1536x1024");
		}
	});

	it("returns 1024x1024 for 1:1", () => {
		expect(aspectToGptSize("1:1")).toBe("1024x1024");
	});

	it("returns 1024x1024 for unrecognized ratios", () => {
		expect(aspectToGptSize("2:1" as AspectRatio)).toBe("1024x1024");
		expect(aspectToGptSize("20:9" as AspectRatio)).toBe("1024x1024");
		expect(aspectToGptSize("unknown" as AspectRatio)).toBe("1024x1024");
	});
});

// --- Task 5.2: aspectToFlux2Size full coverage ---
// Requirements: 4.4, 4.5
describe("aspectToFlux2Size — full coverage", () => {
	const expectedMappings: [AspectRatio, string][] = [
		["21:9", "21:9_2560x1088"],
		["16:9", "landscape_16_9"],
		["3:2", "3:2_1536x1024"],
		["4:3", "landscape_4_3"],
		["5:4", "5:4_1280x1024"],
		["1:1", "square_hd"],
		["4:5", "4:5_1024x1280"],
		["3:4", "portrait_4_3"],
		["2:3", "2:3_1024x1536"],
		["9:16", "portrait_16_9"],
	];

	it("maps all 10 standard aspect ratios correctly", () => {
		for (const [ratio, expected] of expectedMappings) {
			expect(aspectToFlux2Size(ratio)).toBe(expected);
		}
	});

	it("returns square_hd for unrecognized ratios", () => {
		expect(aspectToFlux2Size("2:1" as AspectRatio)).toBe("square_hd");
		expect(aspectToFlux2Size("unknown" as AspectRatio)).toBe("square_hd");
	});
});

// --- Task 5.3: estimateCost full coverage ---
// Requirements: 4.6, 4.7, 4.8, 4.10
describe("estimateCost — all models", () => {
	it("returns correct base cost for each generation model", () => {
		expect(estimateCost("gpt", "2K", 1)).toBeCloseTo(0.13);
		expect(estimateCost("banana", "2K", 1)).toBeCloseTo(0.15);
		expect(estimateCost("gemini", "2K", 1)).toBeCloseTo(0.039);
		expect(estimateCost("gemini3", "2K", 1)).toBeCloseTo(0.15);
		expect(estimateCost("flux2", "2K", 1)).toBeCloseTo(0.05);
		expect(estimateCost("flux2Flash", "2K", 1)).toBeCloseTo(0.02);
		expect(estimateCost("flux2Turbo", "2K", 1)).toBeCloseTo(0.035);
		expect(estimateCost("imagine", "2K", 1)).toBeCloseTo(0.04);
	});

	it("returns correct base cost for each utility model", () => {
		expect(estimateCost("clarity", undefined, 1)).toBeCloseTo(0.02);
		expect(estimateCost("crystal", undefined, 1)).toBeCloseTo(0.02);
		expect(estimateCost("rmbg", undefined, 1)).toBeCloseTo(0.02);
		expect(estimateCost("bria", undefined, 1)).toBeCloseTo(0.02);
	});

	it("returns higher cost for 4K resolution on banana and gemini3", () => {
		expect(estimateCost("banana", "4K", 1)).toBeCloseTo(0.3);
		expect(estimateCost("gemini3", "4K", 1)).toBeCloseTo(0.3);
	});

	it("returns 0 for unknown model", () => {
		expect(estimateCost("nonexistent", "2K", 1)).toBe(0);
	});
});

// --- Task 5.4: GENERATION_MODELS and UTILITY_MODELS arrays ---
// Requirements: 4.11, 4.12
describe("model arrays", () => {
	it("GENERATION_MODELS contains exactly the expected keys", () => {
		expect([...GENERATION_MODELS].sort()).toEqual(
			[
				"gpt",
				"banana",
				"gemini",
				"gemini3",
				"flux2",
				"flux2Flash",
				"flux2Turbo",
				"imagine",
			].sort()
		);
	});

	it("UTILITY_MODELS contains exactly the expected keys", () => {
		expect([...UTILITY_MODELS].sort()).toEqual(
			["clarity", "crystal", "rmbg", "bria"].sort()
		);
	});
});

// --- Task 5.5: Property 6 — estimateCost scales linearly with numImages ---
// Feature: phase1-pure-utility-tests, Property 6: estimateCost scales linearly with numImages
// **Validates: Requirements 4.9**
describe("Property 6: estimateCost scales linearly with numImages", () => {
	const knownModels = [...GENERATION_MODELS, ...UTILITY_MODELS];
	const resolutions: (CliResolution | undefined)[] = [
		"1K",
		"2K",
		"4K",
		"512x512",
		undefined,
	];

	it("cost(model, res, n) === cost(model, res, 1) * n", () => {
		for (const model of knownModels) {
			for (const resolution of resolutions) {
				for (let numImages = 1; numImages <= 100; numImages++) {
					const baseCost = estimateCost(model, resolution, 1);
					const scaledCost = estimateCost(model, resolution, numImages);
					expect(Math.abs(scaledCost - baseCost * numImages)).toBeLessThan(
						1e-10
					);
				}
			}
		}
	});
});

// --- Task 5.6: Property 7 — aspectToGptSize always returns a valid GPT size ---
// Feature: phase1-pure-utility-tests, Property 7: aspectToGptSize always returns a valid GPT size
// **Validates: Requirements 4.1, 4.2, 4.3**
describe("Property 7: aspectToGptSize always returns a valid GPT size", () => {
	const allAspectRatios: AspectRatio[] = [
		"21:9",
		"16:9",
		"3:2",
		"4:3",
		"5:4",
		"1:1",
		"4:5",
		"3:4",
		"2:3",
		"9:16",
		"2:1",
		"20:9",
		"19.5:9",
		"9:19.5",
		"9:20",
		"1:2",
	];
	const validGptSizes = ["1024x1024", "1024x1536", "1536x1024"];

	it("always returns one of the three valid GPT sizes", () => {
		for (const ratio of allAspectRatios) {
			expect(validGptSizes).toContain(aspectToGptSize(ratio));
		}
	});
});
