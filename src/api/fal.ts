import { loadConfig } from "../utils/config";
import { logger } from "../utils/logger";
import {
	type AspectRatio,
	aspectToFlux2Size,
	aspectToGptSize,
	MODELS,
	type OutputFormat,
	type Resolution,
} from "./models";

const FAL_BASE_URL = "https://fal.run";

export interface GenerateOptions {
	prompt: string;
	model: string;
	aspect?: AspectRatio;
	resolution?: Resolution;
	numImages?: number;
	editImage?: string; // base64 data URL for edit mode
	transparent?: boolean; // Generate with transparent background (GPT model only)
	guidanceScale?: number; // Flux 2 guidance scale (0-20, default 2.5)
	enablePromptExpansion?: boolean; // Flux 2 prompt expansion
	numInferenceSteps?: number; // Flux 2 base only: inference steps (4-50, default 28)
	acceleration?: "none" | "regular" | "high"; // Flux 2 base only: acceleration level (default: regular)
	outputFormat?: OutputFormat; // Output format: jpeg, png, webp (Grok, Flux, Gemini 3 Pro only)
	seed?: number; // Seed for reproducible generations
}

export interface UpscaleOptions {
	imageUrl: string;
	model?: "clarity" | "crystal";
	scaleFactor?: number;
	creativity?: number;
	seed?: number;
}

export interface RemoveBackgroundOptions {
	imageUrl: string;
	model?: "rmbg" | "bria";
}

export interface FalImage {
	url: string;
	width?: number;
	height?: number;
	content_type?: string;
}

export interface FalResponse {
	images: FalImage[];
	seed?: number;
	prompt?: string;
}

export interface FalError {
	detail: string;
}

let _apiKey: string | null = null;

function setApiKey(key: string): void {
	_apiKey = key;
}

async function getApiKey(): Promise<string> {
	// Check manually set key first
	if (_apiKey) return _apiKey;

	// Check environment variable
	const envKey = process.env.FAL_KEY;
	if (envKey) return envKey;

	// Fall back to config file
	const config = await loadConfig();
	if (config.apiKey) return config.apiKey;

	throw new Error(
		"FAL_KEY not found. Set FAL_KEY environment variable or add apiKey to ~/.falcon/config.json",
	);
}

export async function generate(options: GenerateOptions): Promise<FalResponse> {
	const {
		prompt,
		model,
		aspect = "9:16",
		resolution = "2K",
		numImages = 1,
		editImage,
		transparent,
		guidanceScale,
		enablePromptExpansion,
		numInferenceSteps,
		acceleration,
		outputFormat,
		seed,
	} = options;

	logger.debug("Starting image generation", {
		model,
		aspect,
		resolution,
		numImages,
		seed,
	});

	const config = MODELS[model];
	if (!config) {
		logger.error("Unknown model requested", { model });
		throw new Error(`Unknown model: ${model}`);
	}

	let endpoint = `${FAL_BASE_URL}/${config.endpoint}`;

	// Build request body based on model capabilities
	const body: Record<string, unknown> = { prompt };

	if (model === "gpt") {
		body.image_size = aspectToGptSize(aspect);
		body.quality = "high";
		// Transparency support for GPT model
		if (transparent) {
			body.background = "transparent";
			body.output_format = "png";
		}
	} else if (model.startsWith("flux2")) {
		// Flux 2 models use image_size enum instead of aspect_ratio
		body.image_size = aspectToFlux2Size(aspect);
		// Add optional guidance scale
		if (guidanceScale !== undefined) {
			body.guidance_scale = guidanceScale;
		}
		// Add optional prompt expansion
		if (enablePromptExpansion !== undefined) {
			body.enable_prompt_expansion = enablePromptExpansion;
		}
		// Add base Flux 2 specific parameters (not available on Flash/Turbo)
		if (model === "flux2") {
			if (numInferenceSteps !== undefined) {
				body.num_inference_steps = numInferenceSteps;
			}
			if (acceleration !== undefined) {
				body.acceleration = acceleration;
			}
		}
	} else {
		if (config.supportsAspect) {
			body.aspect_ratio = aspect;
		}
		if (config.supportsResolution) {
			body.resolution = resolution;
		}
	}

	if (seed !== undefined) {
		body.seed = seed;
	}

	if (config.supportsNumImages) {
		body.num_images = numImages;
	}

	// Add output_format for models that support it
	if (config.supportsOutputFormat && outputFormat) {
		body.output_format = outputFormat;
	}

	// Handle edit mode
	if (editImage) {
		if (!config.supportsEdit) {
			throw new Error(`Model ${model} does not support image editing`);
		}
		endpoint = `${endpoint}/edit`;
		body.image_urls = [editImage];
	}

	logger.debug("Sending API request", { endpoint, model, aspect });

	// Support fixture-based testing: return canned response instead of making HTTP request
	const apiFixturePath = process.env.FALCON_API_FIXTURE;
	if (apiFixturePath) {
		const file = Bun.file(apiFixturePath);
		const data = await file.json();
		return data as FalResponse;
	}

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Key ${await getApiKey()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		logger.error("API request failed", {
			endpoint,
			status: response.status,
			statusText: response.statusText,
			errorBody,
		});
		throw new Error(
			`Failed to generate image: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
		);
	}

	const data = await response.json();

	if ("detail" in data) {
		logger.error("API returned error detail", {
			endpoint,
			detail: (data as FalError).detail,
		});
		throw new Error((data as FalError).detail);
	}

	logger.debug("Generation successful", {
		endpoint,
		imagesReturned: data.images?.length,
		seed: data.seed,
	});

	return data as FalResponse;
}

export async function upscale(options: UpscaleOptions): Promise<FalResponse> {
	const {
		imageUrl,
		model = "clarity",
		scaleFactor = 2,
		creativity = 0,
		seed,
	} = options;

	logger.debug("Starting image upscale", { model, scaleFactor, seed });

	const config = MODELS[model];
	if (!config || config.type !== "utility") {
		logger.error("Invalid upscale model", { model });
		throw new Error(`Invalid upscale model: ${model}`);
	}

	const body: Record<string, unknown> = {
		image_url: imageUrl,
	};

	if (model === "crystal") {
		body.scale_factor = scaleFactor;
		body.creativity = creativity;
	}

	if (seed !== undefined) {
		body.seed = seed;
	}

	const endpoint = `${FAL_BASE_URL}/${config.endpoint}`;

	// Support fixture-based testing: return canned response instead of making HTTP request
	const apiFixturePath = process.env.FALCON_API_FIXTURE;
	if (apiFixturePath) {
		const file = Bun.file(apiFixturePath);
		const data = await file.json();
		return data as FalResponse;
	}

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Key ${await getApiKey()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		logger.error("Upscale API request failed", {
			endpoint,
			status: response.status,
			statusText: response.statusText,
			errorBody,
		});
		throw new Error(
			`Failed to upscale image: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
		);
	}

	const data = await response.json();

	if ("detail" in data) {
		logger.error("Upscale API returned error detail", {
			endpoint,
			detail: (data as FalError).detail,
		});
		throw new Error((data as FalError).detail);
	}

	logger.debug("Upscale successful", { endpoint, seed: data.seed });

	// Normalize response - upscale APIs return { image: {...} } not { images: [...] }
	if ("image" in data && !("images" in data)) {
		return { images: [data.image] } as FalResponse;
	}

	return data as FalResponse;
}

export async function removeBackground(
	options: RemoveBackgroundOptions,
): Promise<FalResponse> {
	const { imageUrl, model = "rmbg" } = options;

	logger.debug("Starting background removal", { model });

	const config = MODELS[model];
	if (!config) {
		logger.error("Invalid background removal model", { model });
		throw new Error(`Invalid background removal model: ${model}`);
	}

	const endpoint = `${FAL_BASE_URL}/${config.endpoint}`;

	// Support fixture-based testing: return canned response instead of making HTTP request
	const apiFixturePath = process.env.FALCON_API_FIXTURE;
	if (apiFixturePath) {
		const file = Bun.file(apiFixturePath);
		const data = await file.json();
		return data as FalResponse;
	}

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Key ${await getApiKey()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ image_url: imageUrl }),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		logger.error("Background removal API request failed", {
			endpoint,
			status: response.status,
			statusText: response.statusText,
			errorBody,
		});
		throw new Error(
			`Failed to remove background: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
		);
	}

	const data = await response.json();

	if ("detail" in data) {
		logger.error("Background removal API returned error detail", {
			endpoint,
			detail: (data as FalError).detail,
		});
		throw new Error((data as FalError).detail);
	}

	logger.debug("Background removal successful", { endpoint });

	// Normalize response - rmbg APIs return { image: {...} } not { images: [...] }
	if ("image" in data && !("images" in data)) {
		return { images: [data.image] } as FalResponse;
	}

	return data as FalResponse;
}

// Re-export for convenience
export { getApiKey, setApiKey };
