import "../helpers/env";

import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import {
	estimateBackgroundRemovalCost,
	estimateGenerationCost,
	estimateUpscaleCost,
} from "../../src/api/pricing";
import { FALCON_DIR } from "../../src/utils/config";
import { withMockFetch } from "../helpers/fetch";

const originalKey = process.env.FAL_KEY;

afterEach(() => {
	rmSync(FALCON_DIR, { recursive: true, force: true });
	if (originalKey !== undefined) {
		process.env.FAL_KEY = originalKey;
	} else {
		delete process.env.FAL_KEY;
	}
});

describe("pricing", () => {
	it("returns fallback metadata when model is unknown", async () => {
		const estimate = await estimateGenerationCost({
			model: "unknown",
			resolution: "2K",
			numImages: 2,
		});
		expect(estimate.costDetails.estimateSource).toBe("fallback");
		expect(estimate.cost).toBe(0);
	});

	it("uses cached pricing when estimate API fails", async () => {
		const { restore } = withMockFetch(async (input, init) => {
			const url = input.toString();
			if (url.includes("/models/pricing?")) {
				return Response.json({
					prices: [
						{
							endpoint_id: "fal-ai/nano-banana-pro",
							unit_price: 0.15,
							unit: "image",
							currency: "USD",
						},
					],
				});
			}
			if (url.includes("/models/pricing/estimate")) {
				return new Response("fail", { status: 500 });
			}
			return new Response("not found", { status: 404 });
		});

		process.env.FAL_KEY = "test-key";
		const estimate = await estimateGenerationCost({
			model: "banana",
			resolution: "2K",
			numImages: 2,
		});
		restore();

		expect(estimate.costDetails.estimateSource).toBe("pricing");
		expect(estimate.cost).toBeCloseTo(0.3);
	});

	it("returns estimate results when API succeeds", async () => {
		const { restore } = withMockFetch(async (input) => {
			const url = input.toString();
			if (url.includes("/models/pricing?")) {
				return Response.json({
					prices: [
						{
							endpoint_id: "fal-ai/flux-2",
							unit_price: 0.05,
							unit: "image",
							currency: "USD",
						},
					],
				});
			}
			if (url.includes("/models/pricing/estimate")) {
				return Response.json({ total_cost: 0.2, currency: "USD" });
			}
			return new Response("not found", { status: 404 });
		});

		process.env.FAL_KEY = "test-key";
		const estimate = await estimateGenerationCost({
			model: "flux2",
			resolution: "2K",
			numImages: 4,
		});
		restore();

		expect(estimate.costDetails.estimateSource).toBe("estimate");
		expect(estimate.cost).toBeCloseTo(0.2);
	});

	it("handles megapixel units for upscales", async () => {
		const { restore } = withMockFetch(async (input) => {
			const url = input.toString();
			if (url.includes("/models/pricing?")) {
				return Response.json({
					prices: [
						{
							endpoint_id: "clarityai/crystal-upscaler",
							unit_price: 0.016,
							unit: "megapixel",
							currency: "USD",
						},
					],
				});
			}
			if (url.includes("/models/pricing/estimate")) {
				return new Response("fail", { status: 500 });
			}
			return new Response("not found", { status: 404 });
		});

		process.env.FAL_KEY = "test-key";
		const estimate = await estimateUpscaleCost({
			model: "crystal",
			inputWidth: 1000,
			inputHeight: 1000,
			scaleFactor: 2,
		});
		restore();

		expect(estimate.costDetails.estimateSource).toBe("pricing");
		expect(estimate.cost).toBeCloseTo(0.064);
	});

	it("uses fallback when background removal estimate fails", async () => {
		const { restore } = withMockFetch(async () => {
			return new Response("fail", { status: 500 });
		});

		process.env.FAL_KEY = "test-key";
		const estimate = await estimateBackgroundRemovalCost({
			model: "rmbg",
		});
		restore();

		expect(estimate.costDetails.estimateSource).toBe("fallback");
	});
});
