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
	| "9:16";

export type Resolution = "1K" | "2K" | "4K";

export type ModelType = "generation" | "utility";

export interface ModelConfig {
	name: string;
	endpoint: string;
	type: ModelType;
	pricing: string;
	supportsAspect: boolean;
	supportsResolution: boolean;
	supportsEdit: boolean;
	supportsNumImages: boolean;
	maxReferenceImages?: number;
	defaultParams?: Record<string, unknown>;
}

export const MODELS: Record<string, ModelConfig> = {
	// Generation models
	gpt: {
		name: "GPT Image 1.5",
		endpoint: "fal-ai/gpt-image-1.5",
		type: "generation",
		pricing: "$0.01-$0.20/image",
		supportsAspect: false, // Uses image_size instead
		supportsResolution: false,
		supportsEdit: true,
		supportsNumImages: true,
		maxReferenceImages: 4,
		defaultParams: { quality: "high" },
	},
	banana: {
		name: "Nano Banana Pro",
		endpoint: "fal-ai/nano-banana-pro",
		type: "generation",
		pricing: "$0.15-$0.30/image",
		supportsAspect: true,
		supportsResolution: true,
		supportsEdit: true,
		supportsNumImages: true,
		maxReferenceImages: 14,
	},
	gemini: {
		name: "Gemini 2.5 Flash",
		endpoint: "fal-ai/gemini-25-flash-image",
		type: "generation",
		pricing: "$0.039/image",
		supportsAspect: true,
		supportsResolution: false,
		supportsEdit: true,
		supportsNumImages: true,
		maxReferenceImages: 4,
	},
	gemini3: {
		name: "Gemini 3 Pro",
		endpoint: "fal-ai/gemini-3-pro-image-preview",
		type: "generation",
		pricing: "$0.15-$0.30/image",
		supportsAspect: true,
		supportsResolution: true,
		supportsEdit: true,
		supportsNumImages: true,
		maxReferenceImages: 4,
	},

	// Utility models
	clarity: {
		name: "Clarity Upscaler",
		endpoint: "fal-ai/clarity-upscaler",
		type: "utility",
		pricing: "~$0.02/image",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
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
	},
	rmbg: {
		name: "BiRefNet (Background Removal)",
		endpoint: "fal-ai/birefnet",
		type: "utility",
		pricing: "~$0.02/image",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
	},
	bria: {
		name: "Bria RMBG 2.0",
		endpoint: "fal-ai/bria/background/remove",
		type: "utility",
		pricing: "$0.018/image",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
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

// Estimate cost based on model and settings
export function estimateCost(
	model: string,
	resolution?: Resolution,
	numImages = 1
): number {
	const config = MODELS[model];
	if (!config) {
		return 0;
	}

	let baseCost = 0;
	switch (model) {
		case "gpt":
			baseCost = 0.13; // high quality default
			break;
		case "banana":
		case "gemini3":
			baseCost = resolution === "4K" ? 0.3 : 0.15;
			break;
		case "gemini":
			baseCost = 0.039;
			break;
		case "clarity":
		case "crystal":
		case "rmbg":
		case "bria":
			baseCost = 0.02;
			break;
		default:
			baseCost = 0.1;
	}

	return baseCost * numImages;
}
