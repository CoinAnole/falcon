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
}

export const MODELS: Record<string, ModelConfig> = {
	gpt: {
		name: "GPT Image",
		endpoint: "fal-ai/gpt-image-1.5",
		type: "generation",
		pricing: "$0.13",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: true,
		supportsNumImages: true,
		maxReferenceImages: 4,
	},
	banana: {
		name: "Banana Pro",
		endpoint: "fal-ai/nano-banana-pro",
		type: "generation",
		pricing: "$0.15",
		supportsAspect: true,
		supportsResolution: true,
		supportsEdit: true,
		supportsNumImages: true,
		maxReferenceImages: 14,
	},
	gemini: {
		name: "Gemini Flash",
		endpoint: "fal-ai/gemini-25-flash-image",
		type: "generation",
		pricing: "$0.04",
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
		pricing: "$0.15",
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
		pricing: "$0.02",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
	},
	crystal: {
		name: "Crystal Upscaler",
		endpoint: "clarityai/crystal-upscaler",
		type: "utility",
		pricing: "$0.02",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
	},
	rmbg: {
		name: "Background Removal",
		endpoint: "fal-ai/birefnet",
		type: "utility",
		pricing: "$0.02",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
	},
	bria: {
		name: "Bria RMBG",
		endpoint: "fal-ai/bria/background/remove",
		type: "utility",
		pricing: "$0.02",
		supportsAspect: false,
		supportsResolution: false,
		supportsEdit: false,
		supportsNumImages: false,
	},
};

export const GENERATION_MODELS = Object.entries(MODELS)
	.filter(([, m]) => m.type === "generation")
	.map(([key]) => key);

export const ASPECT_RATIOS: AspectRatio[] = [
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
];

export const RESOLUTIONS: Resolution[] = ["1K", "2K", "4K"];

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

export function estimateCost(
	model: string,
	resolution?: Resolution,
	numImages = 1
): number {
	switch (model) {
		case "gpt":
			return 0.13 * numImages;
		case "banana":
		case "gemini3":
			return (resolution === "4K" ? 0.3 : 0.15) * numImages;
		case "gemini":
			return 0.039 * numImages;
		case "clarity":
		case "crystal":
		case "rmbg":
		case "bria":
			return 0.02 * numImages;
		default:
			return 0.1 * numImages;
	}
}

/** Format presets that set aspect + resolution in one click */
export const FORMAT_PRESETS: Record<
	string,
	{ label: string; aspect: AspectRatio; resolution?: Resolution }
> = {
	cover: { label: "Cover", aspect: "2:3", resolution: "2K" },
	square: { label: "Square", aspect: "1:1" },
	landscape: { label: "Landscape", aspect: "16:9" },
	portrait: { label: "Portrait", aspect: "2:3" },
	story: { label: "Story", aspect: "9:16" },
	og: { label: "OG Image", aspect: "16:9" },
	wide: { label: "Wide", aspect: "21:9" },
};
