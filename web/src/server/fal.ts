import {
	type AspectRatio,
	aspectToGptSize,
	MODELS,
	type Resolution,
} from "@/lib/models";

const FAL_BASE_URL = "https://fal.run";
const FAL_REST_URL = "https://rest.alpha.fal.ai";

export interface GenerateOptions {
	prompt: string;
	model: string;
	aspect?: AspectRatio;
	resolution?: Resolution;
	numImages?: number;
	editImageUrls?: string[];
	transparent?: boolean;
	inputFidelity?: "low" | "high";
}

export interface UpscaleOptions {
	imageUrl: string;
	model?: "clarity" | "crystal";
	scaleFactor?: number;
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

function getApiKey(): string {
	const key = process.env.FAL_KEY;
	if (!key) {
		throw new Error("FAL_KEY environment variable is not set");
	}
	return key;
}

export async function generate(options: GenerateOptions): Promise<FalResponse> {
	const {
		prompt,
		model,
		aspect = "1:1",
		resolution = "2K",
		numImages = 1,
		editImageUrls,
		transparent,
		inputFidelity,
	} = options;

	const config = MODELS[model];
	if (!config) {
		throw new Error(`Unknown model: ${model}`);
	}

	let endpoint = `${FAL_BASE_URL}/${config.endpoint}`;
	const body: Record<string, unknown> = { prompt };

	if (model === "gpt") {
		if (!editImageUrls?.length) {
			body.image_size = aspectToGptSize(aspect);
		}
		body.quality = "high";
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

	if (editImageUrls?.length) {
		if (!config.supportsEdit) {
			throw new Error(`Model ${model} does not support image editing`);
		}
		endpoint = `${endpoint}/edit`;
		body.image_urls = editImageUrls;

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
		throw new Error((data as { detail: string }).detail);
	}

	return data as FalResponse;
}

export async function upscale(options: UpscaleOptions): Promise<FalResponse> {
	const { imageUrl, model = "clarity", scaleFactor = 2 } = options;

	const config = MODELS[model];
	if (!config || config.type !== "utility") {
		throw new Error(`Invalid upscale model: ${model}`);
	}

	const body: Record<string, unknown> = { image_url: imageUrl };

	if (model === "crystal") {
		body.scale_factor = scaleFactor;
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
		throw new Error((data as { detail: string }).detail);
	}

	// Normalize: upscale APIs return { image: {...} } not { images: [...] }
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
		throw new Error((data as { detail: string }).detail);
	}

	// Normalize: rmbg APIs return { image: {...} } not { images: [...] }
	if ("image" in data && !("images" in data)) {
		return { images: [data.image] } as FalResponse;
	}

	return data as FalResponse;
}

/**
 * Upload a buffer to fal.ai CDN storage. Used for edit mode when
 * the user uploads a reference image from the browser.
 */
export async function uploadBuffer(
	buffer: ArrayBuffer,
	contentType: string,
	fileName: string
): Promise<string> {
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
	const putResponse = await fetch(upload_url, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: buffer,
	});

	if (!putResponse.ok) {
		throw new Error(
			`Upload PUT failed: ${putResponse.status} ${await putResponse.text()}`
		);
	}

	return file_url;
}
