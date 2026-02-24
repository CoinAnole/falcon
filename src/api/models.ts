export type AspectRatio =
	| "21:9"
	| "16:9"
	| "3:2"
	| "4:3"
	| "5:4"
	| "1:1"
	| "4:5"
	| "3:4"
	| "2:3"
	| "9:16"
	| "2:1"
	| "20:9"
	| "19.5:9"
	| "9:19.5"
	| "9:20"
	| "1:2";

export type Resolution = "1K" | "2K" | "4K";
export type CliResolution = Resolution | "512x512";

export type ModelType = "generation" | "utility";

export type OutputFormat = "jpeg" | "png" | "webp";

export interface ModelConfig {
	name: string;
	endpoint: string;
	type: ModelType;
	pricing: string;
	supportsAspect: boolean;
	supportsResolution: boolean;
	supportsEdit: boolean;
	editInputField?: "image_urls" | "image_url";
	maxEditInputImages?: number;
	supportsNumImages: boolean;
	supportsOutputFormat: boolean;
	defaultParams?: Record<string, unknown>;
	supportedAspectRatios?: AspectRatio[];
}

export const MODELS: Record<string, ModelConfig> = {
	// Generation models
	gpt: {
		name: "GPT Image 1.5",
		endpoint: "fal-ai/gpt-image-1.5",
		type: "generation",
		pricing: "$1.00/unit (~$0.21/call)",
		supportsAspect: false, // Uses image_size instead
		supportsResolution: false,
		supportsEdit: true,
		editInputField: "image_urls",
		supportsNumImages: true,
		supportsOutputFormat: false,
		defaultParams: { quality: "high" },
	},
	banana: {
		name: "Nano Banana Pro",
		endpoint: "fal-ai/nano-banana-pro",
		type: "generation",
		pricing: "$0.15/image",
		supportsAspect: true,
		supportsResolution: true,
		supportsEdit: true,
		editInputField: "image_urls",
		supportsNumImages: true,
		supportsOutputFormat: false,
	},
	gemini: {
		name: "Gemini 2.5 Flash",
		endpoint: "fal-ai/gemini-25-flash-image",
		type: "generation",
		pricing: "$0.0398/image",
		supportsAspect: true,
		supportsResolution: false,
		supportsEdit: true,
		editInputField: "image_urls",
		supportsNumImages: true,
		supportsOutputFormat: false,
	},
	gemini3: {
		name: "Gemini 3 Pro",
		endpoint: "fal-ai/gemini-3-pro-image-preview",
		type: "generation",
		pricing: "$0.15/image",
		supportsAspect: true,
		supportsResolution: true,
		supportsEdit: true,
		editInputField: "image_urls",
		supportsNumImages: true,
		supportsOutputFormat: true,
	},
	flux2: {
		name: "Flux 2",
		endpoint: "fal-ai/flux-2",
		type: "generation",
		pricing: "$0.012/megapixel",
		supportsAspect: false, // Uses image_size instead
		supportsResolution: false,
		supportsEdit: true,
		editInputField: "image_urls",
		maxEditInputImages: 4,
		supportsNumImages: true,
		supportsOutputFormat: true,
	},
	flux2Flash: {
		name: "Flux 2 Flash",
		endpoint: "fal-ai/flux-2/flash",
		type: "generation",
		pricing: "$0.005/megapixel",
		supportsAspect: false, // Uses image_size instead
		supportsResolution: false,
		supportsEdit: true,
		editInputField: "image_urls",
		maxEditInputImages: 4,
		supportsNumImages: true,
		supportsOutputFormat: true,
	},
	flux2Turbo: {
		name: "Flux 2 Turbo",
		endpoint: "fal-ai/flux-2/turbo",
		type: "generation",
		pricing: "$0.008/megapixel",
		supportsAspect: false, // Uses image_size instead
		supportsResolution: false,
		supportsEdit: true,
		editInputField: "image_urls",
		maxEditInputImages: 4,
		supportsNumImages: true,
		supportsOutputFormat: true,
	},
	imagine: {
		name: "Grok Imagine",
		endpoint: "xai/grok-imagine-image",
		type: "generation",
		pricing: "$0.02/image",
		supportsAspect: true,
		supportsResolution: false,
		supportsEdit: true,
		editInputField: "image_url",
		maxEditInputImages: 1,
		supportsNumImages: true,
		supportsOutputFormat: true,
		supportedAspectRatios: [
			"1:1",
			"4:3",
			"3:4",
			"16:9",
			"9:16",
			"3:2",
			"2:3",
			"4:5",
			"5:4",
			"21:9",
			"2:1",
			"20:9",
			"19.5:9",
			"9:19.5",
			"9:20",
			"1:2",
		],
	},

	// Utility models
	clarity: {
		name: "Clarity Upscaler",
		endpoint: "fal-ai/clarity-upscaler",
		type: "utility",
		pricing: "$0.03/megapixel",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
		supportsOutputFormat: false,
	},
	crystal: {
		name: "Crystal Upscaler",
		endpoint: "clarityai/crystal-upscaler",
		type: "utility",
		pricing: "$0.016/megapixel",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
		supportsOutputFormat: false,
	},
	rmbg: {
		name: "BiRefNet (Background Removal)",
		endpoint: "fal-ai/birefnet",
		type: "utility",
		pricing: "$0.00111/compute-second",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
		supportsOutputFormat: false,
	},
	bria: {
		name: "Bria RMBG 2.0",
		endpoint: "fal-ai/bria/background/remove",
		type: "utility",
		pricing: "$0.018/generation",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
		supportsOutputFormat: false,
	},
};

export const GENERATION_MODELS = Object.entries(MODELS)
	.filter(([_, m]) => m.type === "generation")
	.map(([key]) => key);

export const UTILITY_MODELS = Object.entries(MODELS)
	.filter(([_, m]) => m.type === "utility")
	.map(([key]) => key);

// Ordered by popularity: square first, then common ratios
export const ASPECT_RATIOS: AspectRatio[] = [
	"1:1", // Square - most common
	"4:3", // Classic
	"3:4", // Portrait classic
	"16:9", // Widescreen
	"9:16", // Stories/mobile
	"3:2", // Photography
	"2:3", // Portrait photo
	"4:5", // Instagram
	"5:4", // Older format
	"21:9", // Ultrawide
];

export const RESOLUTIONS: Resolution[] = ["1K", "2K", "4K"];
export const CLI_RESOLUTIONS: CliResolution[] = [...RESOLUTIONS, "512x512"];

export const OUTPUT_FORMATS: OutputFormat[] = ["jpeg", "png", "webp"];

// Map aspect ratio to GPT image_size (GPT doesn't support arbitrary aspects)
export function aspectToGptSize(aspect: AspectRatio): string {
	switch (aspect) {
		case "9:16":
		case "2:3":
		case "4:5":
		case "3:4":
			return "1024x1536";
		case "16:9":
		case "3:2":
		case "5:4":
		case "4:3":
		case "21:9":
			return "1536x1024";
		default:
			return "1024x1024";
	}
}

// Map aspect ratio to Flux 2 image_size enum
export function aspectToFlux2Size(aspect: AspectRatio): string {
	switch (aspect) {
		case "21:9":
			return "21:9_2560x1088";
		case "16:9":
			return "landscape_16_9";
		case "3:2":
			return "3:2_1536x1024";
		case "4:3":
			return "landscape_4_3";
		case "5:4":
			return "5:4_1280x1024";
		case "1:1":
			return "square_hd";
		case "4:5":
			return "4:5_1024x1280";
		case "3:4":
			return "portrait_4_3";
		case "2:3":
			return "2:3_1024x1536";
		case "9:16":
			return "portrait_16_9";
		default:
			return "square_hd";
	}
}

// Estimate cost based on model and settings
export function estimateCost(
	model: string,
	_resolution?: CliResolution,
	numImages = 1
): number {
	const config = MODELS[model];
	if (!config) {
		return 0;
	}

	let baseCost = 0;
	switch (model) {
		case "gpt":
			baseCost = 0.21;
			break;
		case "banana":
		case "gemini3":
			baseCost = 0.15;
			break;
		case "gemini":
			baseCost = 0.0398;
			break;
		case "flux2":
			baseCost = 0.012;
			break;
		case "flux2Flash":
			baseCost = 0.005;
			break;
		case "flux2Turbo":
			baseCost = 0.008;
			break;
		case "imagine":
			baseCost = 0.02;
			break;
		case "clarity":
			baseCost = 0.03;
			break;
		case "crystal":
			baseCost = 0.016;
			break;
		case "rmbg":
			baseCost = 0.001_11;
			break;
		case "bria":
			baseCost = 0.018;
			break;
		default:
			baseCost = 0.1;
	}

	return baseCost * numImages;
}

// Get aspect ratios for a specific model (model-specific or default)
export function getAspectRatiosForModel(model: string): AspectRatio[] {
	const config = MODELS[model];
	return config?.supportedAspectRatios ?? ASPECT_RATIOS;
}
