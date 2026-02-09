import {
	type AspectRatio,
	aspectToGptSize,
	MODELS,
	type Resolution,
} from "./models";

const FAL_BASE_URL = "https://fal.run";
const FAL_REST_URL = "https://rest.alpha.fal.ai";

export interface GenerateOptions {
	prompt: string;
	model: string;
	aspect?: AspectRatio;
	resolution?: Resolution;
	numImages?: number;
	editImages?: string[]; // file paths or CDN URLs for edit/reference mode
	transparent?: boolean; // Generate with transparent background (GPT model only)
	inputFidelity?: "low" | "high"; // GPT edit mode: low = loose inspiration, high = preserve composition
}

export interface UpscaleOptions {
	imageUrl: string;
	model?: "clarity" | "crystal";
	scaleFactor?: number;
	creativity?: number;
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

function getApiKey(): string {
	// Check manually set key first
	if (_apiKey) {
		return _apiKey;
	}

	// Check environment variable
	const envKey = process.env.FAL_KEY;
	if (envKey) {
		return envKey;
	}

	throw new Error(
		"FAL_KEY not found. Set FAL_KEY environment variable or configure in ~/.falcon/config.json"
	);
}

export async function generate(options: GenerateOptions): Promise<FalResponse> {
	const {
		prompt,
		model,
		aspect = "9:16",
		resolution = "2K",
		numImages = 1,
		editImages,
		transparent,
		inputFidelity,
	} = options;

	const config = MODELS[model];
	if (!config) {
		throw new Error(`Unknown model: ${model}`);
	}

	let endpoint = `${FAL_BASE_URL}/${config.endpoint}`;

	// Build request body based on model capabilities
	const body: Record<string, unknown> = { prompt };

	if (model === "gpt") {
		// Only set image_size for generation mode — edit mode preserves source dimensions
		if (!editImages?.length) {
			body.image_size = aspectToGptSize(aspect);
		}
		body.quality = "high";
		// Transparency support for GPT model
		if (transparent) {
			body.background = "transparent";
			body.output_format = "png";
		}
	} else {
		if (config.supportsAspect) {
			body.aspect_ratio = aspect;
		}
		if (config.supportsResolution) {
			body.resolution = resolution;
		}
	}

	if (config.supportsNumImages) {
		body.num_images = numImages;
	}

	// Handle edit/reference mode — upload files to fal CDN, then pass URLs
	if (editImages?.length) {
		if (!config.supportsEdit) {
			throw new Error(`Model ${model} does not support image editing`);
		}
		endpoint = `${endpoint}/edit`;

		const imageUrls = await Promise.all(
			editImages.map((img) =>
				img.startsWith("http") ? Promise.resolve(img) : uploadFile(img)
			)
		);
		body.image_urls = imageUrls;

		if (model === "gpt" && inputFidelity) {
			body.input_fidelity = inputFidelity;
		}
	}

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Key ${getApiKey()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	const data = await response.json();

	if ("detail" in data) {
		throw new Error((data as FalError).detail);
	}

	return data as FalResponse;
}

export async function upscale(options: UpscaleOptions): Promise<FalResponse> {
	const {
		imageUrl,
		model = "clarity",
		scaleFactor = 2,
		creativity = 0,
	} = options;

	const config = MODELS[model];
	if (!config || config.type !== "utility") {
		throw new Error(`Invalid upscale model: ${model}`);
	}

	const body: Record<string, unknown> = {
		image_url: imageUrl,
	};

	if (model === "crystal") {
		body.scale_factor = scaleFactor;
		body.creativity = creativity;
	}

	const response = await fetch(`${FAL_BASE_URL}/${config.endpoint}`, {
		method: "POST",
		headers: {
			Authorization: `Key ${getApiKey()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	const data = await response.json();

	if ("detail" in data) {
		throw new Error((data as FalError).detail);
	}

	// Normalize response - upscale APIs return { image: {...} } not { images: [...] }
	if ("image" in data && !("images" in data)) {
		return { images: [data.image] } as FalResponse;
	}

	return data as FalResponse;
}

export async function removeBackground(
	options: RemoveBackgroundOptions
): Promise<FalResponse> {
	const { imageUrl, model = "rmbg" } = options;

	const config = MODELS[model];
	if (!config) {
		throw new Error(`Invalid background removal model: ${model}`);
	}

	const response = await fetch(`${FAL_BASE_URL}/${config.endpoint}`, {
		method: "POST",
		headers: {
			Authorization: `Key ${getApiKey()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ image_url: imageUrl }),
	});

	const data = await response.json();

	if ("detail" in data) {
		throw new Error((data as FalError).detail);
	}

	// Normalize response - rmbg APIs return { image: {...} } not { images: [...] }
	if ("image" in data && !("images" in data)) {
		return { images: [data.image] } as FalResponse;
	}

	return data as FalResponse;
}

/**
 * Upload a local file to fal.ai CDN storage and return the public URL.
 * Uses the two-step initiate + PUT flow.
 */
export async function uploadFile(filePath: string): Promise<string> {
	const file = Bun.file(filePath);
	const contentType = file.type || "application/octet-stream";
	const fileName = filePath.split("/").pop() || "upload.bin";

	// Step 1: Initiate upload to get presigned URL
	const initiateResponse = await fetch(
		`${FAL_REST_URL}/storage/upload/initiate?storage_type=fal-cdn-v3`,
		{
			method: "POST",
			headers: {
				Authorization: `Key ${getApiKey()}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				content_type: contentType,
				file_name: fileName,
			}),
		}
	);

	if (!initiateResponse.ok) {
		throw new Error(
			`Upload initiate failed: ${initiateResponse.status} ${await initiateResponse.text()}`
		);
	}

	const { file_url, upload_url } = (await initiateResponse.json()) as {
		file_url: string;
		upload_url: string;
	};

	// Step 2: PUT the file content to the presigned URL
	const fileBuffer = await file.arrayBuffer();
	const putResponse = await fetch(upload_url, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: fileBuffer,
	});

	if (!putResponse.ok) {
		throw new Error(
			`Upload PUT failed: ${putResponse.status} ${await putResponse.text()}`
		);
	}

	return file_url;
}

// Re-export for convenience
export { getApiKey, setApiKey };
