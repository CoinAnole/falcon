import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CostMetadata, EstimateType } from "../types/pricing";
import { FALCON_DIR } from "../utils/config";
import { logger } from "../utils/logger";
import { getApiKey } from "./fal";
import { estimateCost, MODELS, type CliResolution } from "./models";

const PRICING_BASE_URL = "https://api.fal.ai/v1";
const PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function getPricingCachePath(): string {
	return join(FALCON_DIR, "pricing.json");
}

interface PricingCache {
	fetchedAt: string;
	prices: Record<string, PriceEntry>;
}

export interface PriceEntry {
	endpointId: string;
	unitPrice: number;
	unit: string;
	currency: string;
}

export interface PricingEstimate {
	cost: number;
	costDetails: CostMetadata;
}

function ensureFalconDir(): void {
	if (!existsSync(FALCON_DIR)) {
		mkdirSync(FALCON_DIR, { recursive: true, mode: 0o700 });
	}
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
	const tempPath = `${filePath}.${randomUUID()}.tmp`;
	try {
		writeFileSync(tempPath, data, { mode: 0o600 });
		renameSync(tempPath, filePath);
	} catch (err) {
		try {
			if (existsSync(tempPath)) {
				unlinkSync(tempPath);
			}
		} catch {
			// Ignore cleanup errors
		}
		throw err;
	}
}

async function loadPricingCache(): Promise<PricingCache | null> {
	const cachePath = getPricingCachePath();
	if (!existsSync(cachePath)) return null;
	try {
		const file = Bun.file(cachePath);
		return (await file.json()) as PricingCache;
	} catch {
		return null;
	}
}

async function savePricingCache(cache: PricingCache): Promise<void> {
	ensureFalconDir();
	const cachePath = getPricingCachePath();
	await atomicWrite(cachePath, JSON.stringify(cache, null, 2));
}

function isCacheFresh(cache: PricingCache | null): boolean {
	if (!cache?.fetchedAt) return false;
	const fetchedAtMs = Date.parse(cache.fetchedAt);
	if (Number.isNaN(fetchedAtMs)) return false;
	return Date.now() - fetchedAtMs < PRICING_CACHE_TTL_MS;
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function isComputeUnit(unit: string | undefined): boolean {
	if (!unit) return false;
	const normalized = unit.toLowerCase();
	return (
		normalized.includes("gpu") ||
		normalized.includes("compute") ||
		normalized.includes("second")
	);
}

function isMegapixelUnit(unit: string | undefined): boolean {
	if (!unit) return false;
	const normalized = unit.toLowerCase();
	return normalized.includes("megapixel") || normalized.includes("mp");
}

async function fetchPricingForEndpoints(
	endpointIds: string[],
): Promise<Record<string, PriceEntry>> {
	if (endpointIds.length === 0) return {};

	const fixturePath = process.env.FALCON_PRICING_FIXTURE;
	if (fixturePath) {
		try {
			const file = Bun.file(fixturePath);
			const data = (await file.json()) as {
				prices: {
					endpoint_id: string;
					unit_price: number;
					unit: string;
					currency: string;
				}[];
			};
			const results: Record<string, PriceEntry> = {};
			for (const endpointId of endpointIds) {
				const price = data.prices?.find(
					(entry) => entry.endpoint_id === endpointId,
				);
				if (!price) {
					throw new Error(`Pricing fixture missing endpoint: ${endpointId}`);
				}
				results[endpointId] = {
					endpointId: price.endpoint_id,
					unitPrice: price.unit_price,
					unit: price.unit,
					currency: price.currency,
				};
			}
			return results;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(
				`Failed to load pricing fixture: ${fixturePath}. ${message}`,
			);
		}
	}

	const apiKey = await getApiKey();
	const results: Record<string, PriceEntry> = {};

	// Add timeout to prevent hanging
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

	try {
		for (const batch of chunk(endpointIds, 50)) {
			const params = new URLSearchParams();
			for (const endpointId of batch) {
				params.append("endpoint_id", endpointId);
			}

			const response = await fetch(
				`${PRICING_BASE_URL}/models/pricing?${params.toString()}`,
				{
					headers: {
						Authorization: `Key ${apiKey}`,
					},
					signal: controller.signal,
				},
			);

			if (!response.ok) {
				logger.error("Pricing API request failed", {
					status: response.status,
					statusText: response.statusText,
				});
				throw new Error(`Failed to fetch pricing: ${response.status}`);
			}

			logger.debug("Pricing data fetched successfully", {
				endpointCount: endpointIds.length,
			});

			const data = (await response.json()) as {
				prices: {
					endpoint_id: string;
					unit_price: number;
					unit: string;
					currency: string;
				}[];
			};

			for (const price of data.prices) {
				results[price.endpoint_id] = {
					endpointId: price.endpoint_id,
					unitPrice: price.unit_price,
					unit: price.unit,
					currency: price.currency,
				};
			}
		}
	} finally {
		clearTimeout(timeoutId);
	}

	return results;
}

async function getPricingEntries(
	endpointIds: string[],
	refresh = false,
): Promise<Record<string, PriceEntry>> {
	const cache = await loadPricingCache();
	const cacheFresh = isCacheFresh(cache);
	const cachedPrices = cache?.prices ?? {};
	const missing = endpointIds.filter((id) => !cachedPrices[id]);

	if (!refresh && cacheFresh && missing.length === 0) {
		return cachedPrices;
	}

	let fetched: Record<string, PriceEntry> = {};
	try {
		fetched = await fetchPricingForEndpoints(endpointIds);
	} catch {
		return cachedPrices;
	}

	const merged = { ...cachedPrices, ...fetched };
	await savePricingCache({
		fetchedAt: new Date().toISOString(),
		prices: merged,
	});
	return merged;
}

async function estimateWithApi(
	estimateType: EstimateType,
	endpointId: string,
	quantity: number,
	unitPrice?: number,
	currency?: string,
): Promise<{ cost: number; currency: string }> {
	// Skip API call in test mode with fixtures - use fixture pricing directly
	if (process.env.FALCON_PRICING_FIXTURE && unitPrice !== undefined) {
		return { cost: unitPrice * quantity, currency: currency || "USD" };
	}

	const apiKey = await getApiKey();

	// Add timeout to prevent hanging
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

	try {
		const response = await fetch(
			`${PRICING_BASE_URL}/models/pricing/estimate`,
			{
				method: "POST",
				headers: {
					Authorization: `Key ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					estimate_type: estimateType,
					endpoints: {
						[endpointId]:
							estimateType === "unit_price"
								? { unit_quantity: quantity }
								: { call_quantity: Math.max(1, Math.round(quantity)) },
					},
				}),
				signal: controller.signal,
			},
		);

		if (!response.ok) {
			logger.error("Pricing estimate API request failed", {
				status: response.status,
				statusText: response.statusText,
				estimateType,
				endpointId,
			});
			throw new Error(`Failed to estimate pricing: ${response.status}`);
		}

		const data = (await response.json()) as {
			total_cost: number;
			currency: string;
		};

		return { cost: data.total_cost, currency: data.currency };
	} finally {
		clearTimeout(timeoutId);
	}
}

function fallbackEstimate(
	model: string,
	resolution: CliResolution | undefined,
	numImages: number,
	endpointId: string,
	estimateType: EstimateType,
): PricingEstimate {
	const cost = estimateCost(model, resolution, numImages);
	return {
		cost,
		costDetails: {
			currency: "USD",
			estimateType,
			estimateSource: "fallback",
			endpointId,
			unitQuantity: numImages,
		},
	};
}

export async function refreshPricingCache(
	endpointIds: string[],
): Promise<void> {
	if (endpointIds.length === 0) return;
	logger.debug("Refreshing pricing cache", {
		endpointCount: endpointIds.length,
	});
	const fetched = await fetchPricingForEndpoints(endpointIds);
	await savePricingCache({
		fetchedAt: new Date().toISOString(),
		prices: fetched,
	});
	logger.debug("Pricing cache refreshed successfully");
}

export async function estimateGenerationCost(options: {
	model: string;
	resolution?: CliResolution;
	numImages: number;
}): Promise<PricingEstimate> {
	const { model, resolution, numImages } = options;
	logger.debug("Estimating generation cost", { model, resolution, numImages });

	const endpointId = MODELS[model]?.endpoint;
	if (!endpointId) {
		logger.warn("No endpoint found for model, using fallback", { model });
		return fallbackEstimate(model, resolution, numImages, model, "unit_price");
	}

	let pricing: PriceEntry | undefined;
	try {
		const entries = await getPricingEntries([endpointId]);
		pricing = entries[endpointId];
	} catch {
		return fallbackEstimate(
			model,
			resolution,
			numImages,
			endpointId,
			"unit_price",
		);
	}

	const unitQuantity = numImages;
	const estimateType: EstimateType = isComputeUnit(pricing?.unit)
		? "historical_api_price"
		: "unit_price";

	try {
		const estimate = await estimateWithApi(
			estimateType,
			endpointId,
			unitQuantity,
			pricing?.unitPrice,
			pricing?.currency,
		);
		logger.debug("Cost estimated from API", {
			model,
			cost: estimate.cost,
			currency: estimate.currency,
		});
		return {
			cost: estimate.cost,
			costDetails: {
				currency: estimate.currency,
				unit: pricing?.unit,
				unitQuantity,
				estimateType,
				estimateSource: "estimate",
				endpointId,
				unitPrice: pricing?.unitPrice,
			},
		};
	} catch {
		logger.debug("API estimate failed, using cached pricing or fallback", {
			model,
			endpointId,
		});
		if (pricing && estimateType === "unit_price") {
			return {
				cost: pricing.unitPrice * unitQuantity,
				costDetails: {
					currency: pricing.currency,
					unit: pricing.unit,
					unitQuantity,
					estimateType,
					estimateSource: "pricing",
					endpointId,
					unitPrice: pricing.unitPrice,
				},
			};
		}
		return fallbackEstimate(
			model,
			resolution,
			numImages,
			endpointId,
			estimateType,
		);
	}
}

export async function estimateUpscaleCost(options: {
	model: "clarity" | "crystal";
	inputWidth?: number;
	inputHeight?: number;
	scaleFactor: number;
}): Promise<PricingEstimate> {
	const { model, inputWidth, inputHeight, scaleFactor } = options;
	logger.debug("Estimating upscale cost", {
		model,
		inputWidth,
		inputHeight,
		scaleFactor,
	});

	const endpointId = MODELS[model]?.endpoint;
	if (!endpointId) {
		return fallbackEstimate(model, undefined, 1, model, "unit_price");
	}

	let pricing: PriceEntry | undefined;
	try {
		const entries = await getPricingEntries([endpointId]);
		pricing = entries[endpointId];
	} catch {
		return fallbackEstimate(model, undefined, 1, endpointId, "unit_price");
	}

	let unitQuantity = 1;
	if (isMegapixelUnit(pricing?.unit) && inputWidth && inputHeight) {
		const inputMp = (inputWidth * inputHeight) / 1_000_000;
		unitQuantity = inputMp * scaleFactor * scaleFactor;
	}

	const estimateType: EstimateType = isComputeUnit(pricing?.unit)
		? "historical_api_price"
		: "unit_price";

	try {
		const estimate = await estimateWithApi(
			estimateType,
			endpointId,
			unitQuantity,
			pricing?.unitPrice,
			pricing?.currency,
		);
		return {
			cost: estimate.cost,
			costDetails: {
				currency: estimate.currency,
				unit: pricing?.unit,
				unitQuantity,
				estimateType,
				estimateSource: "estimate",
				endpointId,
				unitPrice: pricing?.unitPrice,
			},
		};
	} catch {
		if (pricing && estimateType === "unit_price") {
			return {
				cost: pricing.unitPrice * unitQuantity,
				costDetails: {
					currency: pricing.currency,
					unit: pricing.unit,
					unitQuantity,
					estimateType,
					estimateSource: "pricing",
					endpointId,
					unitPrice: pricing.unitPrice,
				},
			};
		}
		return fallbackEstimate(model, undefined, 1, endpointId, estimateType);
	}
}

export async function estimateBackgroundRemovalCost(options: {
	model: "rmbg" | "bria";
}): Promise<PricingEstimate> {
	const { model } = options;
	logger.debug("Estimating background removal cost", { model });

	const endpointId = MODELS[model]?.endpoint;
	if (!endpointId) {
		return fallbackEstimate(model, undefined, 1, model, "unit_price");
	}

	let pricing: PriceEntry | undefined;
	try {
		const entries = await getPricingEntries([endpointId]);
		pricing = entries[endpointId];
	} catch {
		return fallbackEstimate(model, undefined, 1, endpointId, "unit_price");
	}

	const estimateType: EstimateType = isComputeUnit(pricing?.unit)
		? "historical_api_price"
		: "unit_price";
	const unitQuantity = 1;

	try {
		const estimate = await estimateWithApi(
			estimateType,
			endpointId,
			unitQuantity,
			pricing?.unitPrice,
			pricing?.currency,
		);
		return {
			cost: estimate.cost,
			costDetails: {
				currency: estimate.currency,
				unit: pricing?.unit,
				unitQuantity,
				estimateType,
				estimateSource: "estimate",
				endpointId,
				unitPrice: pricing?.unitPrice,
			},
		};
	} catch {
		if (pricing && estimateType === "unit_price") {
			return {
				cost: pricing.unitPrice * unitQuantity,
				costDetails: {
					currency: pricing.currency,
					unit: pricing.unit,
					unitQuantity,
					estimateType,
					estimateSource: "pricing",
					endpointId,
					unitPrice: pricing.unitPrice,
				},
			};
		}
		return fallbackEstimate(model, undefined, 1, endpointId, estimateType);
	}
}
