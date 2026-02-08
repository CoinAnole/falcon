import { describe, expect, it } from "bun:test";
import {
	ASPECT_RATIOS,
	aspectToFlux2Size,
	aspectToGptSize,
	estimateCost,
	getAspectRatiosForModel,
} from "../../src/api/models";

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
