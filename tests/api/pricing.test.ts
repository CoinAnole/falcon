import "../helpers/env";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	estimateBackgroundRemovalCost,
	estimateGenerationCost,
	estimateUpscaleCost,
	refreshPricingCache,
} from "../../src/api/pricing";
import { FALCON_DIR } from "../../src/utils/config";
import { withMockFetch } from "../helpers/fetch";

let originalKey: string | undefined;

beforeEach(() => {
	originalKey = process.env.FAL_KEY;
});

afterEach(() => {
	rmSync(FALCON_DIR, { recursive: true, force: true });
	if (originalKey !== undefined) {
		process.env.FAL_KEY = originalKey;
	} else {
		delete process.env.FAL_KEY;
	}
});

describe("pricing", () => {
	it("uses fresh cache without fetching", async () => {
		const cachePath = join(FALCON_DIR, "pricing.json");
		mkdirSync(FALCON_DIR, { recursive: true, mode: 0o700 });
		writeFileSync(
			cachePath,
			JSON.stringify(
				{
					fetchedAt: new Date().toISOString(),
					prices: {
						"fal-ai/nano-banana-pro": {
							endpointId: "fal-ai/nano-banana-pro",
							unitPrice: 0.2,
							unit: "image",
							currency: "USD",
						},
					},
				},
				null,
				2,
			),
		);

		const { result: estimate, calls } = await withMockFetch(
			async (input) => {
				const url = input.toString();
				if (url.includes("/models/pricing/estimate")) {
					return new Response("fail", { status: 500 });
				}
				return new Response("unexpected", { status: 500 });
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				return await estimateGenerationCost({
					model: "banana",
					resolution: "2K",
					numImages: 1,
				});
			},
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.input.toString()).toContain("/models/pricing/estimate");
		expect(
			calls.some((call) => call.input.toString().includes("/models/pricing?")),
		).toBe(false);
		expect(estimate.costDetails.estimateSource).toBe("pricing");
		expect(estimate.cost).toBeCloseTo(0.2);
	});

	it("refreshPricingCache writes pricing data to disk", async () => {
		const cachePath = join(FALCON_DIR, "pricing.json");
		const { calls } = await withMockFetch(
			async (input) => {
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
				return new Response("not found", { status: 404 });
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				await refreshPricingCache(["fal-ai/flux-2"]);
			},
		);

		expect(calls.length).toBeGreaterThan(0);
		const firstHeaders = calls[0]?.init?.headers as Record<string, string>;
		expect(firstHeaders?.Authorization).toBe("Key test-key");
		const cacheFile = Bun.file(cachePath);
		const cache = (await cacheFile.json()) as {
			fetchedAt: string;
			prices: Record<string, { unitPrice: number }>;
		};
		expect(cache.prices["fal-ai/flux-2"]?.unitPrice).toBeCloseTo(0.05);
	});

	it("refreshes pricing when cache is stale", async () => {
		const cachePath = join(FALCON_DIR, "pricing.json");
		const staleDate = new Date(Date.now() - 6 * 60 * 60 * 1000 - 1000);
		mkdirSync(FALCON_DIR, { recursive: true, mode: 0o700 });
		writeFileSync(
			cachePath,
			JSON.stringify(
				{
					fetchedAt: staleDate.toISOString(),
					prices: {
						"fal-ai/flux-2": {
							endpointId: "fal-ai/flux-2",
							unitPrice: 0.01,
							unit: "image",
							currency: "USD",
						},
					},
				},
				null,
				2,
			),
		);

		const { result: estimate, calls } = await withMockFetch(
			async (input) => {
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
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				return await estimateGenerationCost({
					model: "flux2",
					resolution: "2K",
					numImages: 4,
				});
			},
		);

		expect(
			calls.some((call) => call.input.toString().includes("/pricing?")),
		).toBe(true);
		expect(estimate.costDetails.estimateSource).toBe("estimate");
	});

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
		const { result: estimate } = await withMockFetch(
			async (input, _init) => {
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
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				return await estimateGenerationCost({
					model: "banana",
					resolution: "2K",
					numImages: 2,
				});
			},
		);

		expect(estimate.costDetails.estimateSource).toBe("pricing");
		expect(estimate.cost).toBeCloseTo(0.3);
	});

	it("defaults to unit pricing when unit is missing", async () => {
		const { result: estimate, calls } = await withMockFetch(
			async (input) => {
				const url = input.toString();
				if (url.includes("/models/pricing?")) {
					return Response.json({
						prices: [
							{
								endpoint_id: "fal-ai/nano-banana-pro",
								unit_price: 0.15,
								currency: "USD",
							},
						],
					});
				}
				if (url.includes("/models/pricing/estimate")) {
					return Response.json({ total_cost: 0.3, currency: "USD" });
				}
				return new Response("not found", { status: 404 });
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				return await estimateGenerationCost({
					model: "banana",
					resolution: "2K",
					numImages: 2,
				});
			},
		);

		const body = JSON.parse(calls[1]?.init?.body as string) as {
			estimate_type: string;
		};
		expect(body.estimate_type).toBe("unit_price");
		expect(estimate.costDetails.estimateSource).toBe("estimate");
		expect(estimate.cost).toBeCloseTo(0.3);
	});

		it("returns estimate results when API succeeds", async () => {
			const { result: estimate, calls } = await withMockFetch(
			async (input) => {
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
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				return await estimateGenerationCost({
					model: "flux2",
					resolution: "2K",
					numImages: 4,
				});
			},
		);

		const estimateCall = calls.find((call) =>
			call.input.toString().includes("/models/pricing/estimate"),
		);
		const estimateHeaders = estimateCall?.init?.headers as Record<
			string,
			string
		>;
		expect(estimateHeaders?.Authorization).toBe("Key test-key");
			expect(estimate.costDetails.estimateSource).toBe("estimate");
			expect(estimate.cost).toBeCloseTo(0.2);
		});

		it("uses historical_api_price and call_quantity for compute-like generation pricing units", async () => {
			const { result: estimate, calls } = await withMockFetch(
				async (input) => {
					const url = input.toString();
					if (url.includes("/models/pricing?")) {
						return Response.json({
							prices: [
								{
									endpoint_id: "fal-ai/flux-2",
									unit_price: 0.04,
									unit: "gpu_second",
									currency: "USD",
								},
							],
						});
					}
					if (url.includes("/models/pricing/estimate")) {
						return Response.json({ total_cost: 0.16, currency: "USD" });
					}
					return new Response("not found", { status: 404 });
				},
				async () => {
					process.env.FAL_KEY = "test-key";
					return await estimateGenerationCost({
						model: "flux2",
						resolution: "2K",
						numImages: 4,
					});
				},
			);

			const estimateCall = calls.find((call) =>
				call.input.toString().includes("/models/pricing/estimate"),
			);
			const estimateBody = JSON.parse(estimateCall?.init?.body as string) as {
				estimate_type: string;
				endpoints: Record<string, { call_quantity?: number; unit_quantity?: number }>;
			};
			expect(estimateBody.estimate_type).toBe("historical_api_price");
			expect(estimateBody.endpoints["fal-ai/flux-2"]?.call_quantity).toBe(4);
			expect(estimateBody.endpoints["fal-ai/flux-2"]?.unit_quantity).toBeUndefined();
			expect(estimate.costDetails.estimateType).toBe("historical_api_price");
			expect(estimate.costDetails.estimateSource).toBe("estimate");
			expect(estimate.cost).toBeCloseTo(0.16);
		});

		it("uses fallback when compute-style generation estimate fails", async () => {
			const { result: estimate } = await withMockFetch(
				async (input) => {
					const url = input.toString();
					if (url.includes("/models/pricing?")) {
						return Response.json({
							prices: [
								{
									endpoint_id: "fal-ai/flux-2",
									unit_price: 0.04,
									unit: "compute_second",
									currency: "USD",
								},
							],
						});
					}
					if (url.includes("/models/pricing/estimate")) {
						return new Response("fail", { status: 500 });
					}
					return new Response("not found", { status: 404 });
				},
				async () => {
					process.env.FAL_KEY = "test-key";
					return await estimateGenerationCost({
						model: "flux2",
						resolution: "2K",
						numImages: 3,
					});
				},
			);

			expect(estimate.costDetails.estimateType).toBe("historical_api_price");
			expect(estimate.costDetails.estimateSource).toBe("fallback");
		});

		it("uses historical_api_price and call_quantity for compute-like upscale pricing units", async () => {
			const { result: estimate, calls } = await withMockFetch(
				async (input) => {
					const url = input.toString();
					if (url.includes("/models/pricing?")) {
						return Response.json({
							prices: [
								{
									endpoint_id: "clarityai/crystal-upscaler",
									unit_price: 0.1,
									unit: "gpu_seconds",
									currency: "USD",
								},
							],
						});
					}
					if (url.includes("/models/pricing/estimate")) {
						return Response.json({ total_cost: 0.11, currency: "USD" });
					}
					return new Response("not found", { status: 404 });
				},
				async () => {
					process.env.FAL_KEY = "test-key";
					return await estimateUpscaleCost({
						model: "crystal",
						inputWidth: 1920,
						inputHeight: 1080,
						scaleFactor: 2,
					});
				},
			);

			const estimateCall = calls.find((call) =>
				call.input.toString().includes("/models/pricing/estimate"),
			);
			const estimateBody = JSON.parse(estimateCall?.init?.body as string) as {
				estimate_type: string;
				endpoints: Record<string, { call_quantity?: number; unit_quantity?: number }>;
			};
			expect(estimateBody.estimate_type).toBe("historical_api_price");
			expect(estimateBody.endpoints["clarityai/crystal-upscaler"]?.call_quantity).toBe(
				1,
			);
			expect(
				estimateBody.endpoints["clarityai/crystal-upscaler"]?.unit_quantity,
			).toBeUndefined();
			expect(estimate.costDetails.estimateType).toBe("historical_api_price");
			expect(estimate.costDetails.estimateSource).toBe("estimate");
			expect(estimate.cost).toBeCloseTo(0.11);
		});

		it("handles megapixel units for upscales", async () => {
			const { result: estimate } = await withMockFetch(
			async (input) => {
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
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				return await estimateUpscaleCost({
					model: "crystal",
					inputWidth: 1000,
					inputHeight: 1000,
					scaleFactor: 2,
				});
			},
		);

		expect(estimate.costDetails.estimateSource).toBe("pricing");
		expect(estimate.cost).toBeCloseTo(0.064);
	});

	it("uses fallback when background removal estimate fails", async () => {
		const { result: estimate } = await withMockFetch(
			async () => {
				return new Response("fail", { status: 500 });
			},
			async () => {
				process.env.FAL_KEY = "test-key";
				return await estimateBackgroundRemovalCost({
					model: "rmbg",
				});
			},
		);

		expect(estimate.costDetails.estimateSource).toBe("fallback");
	});
});
