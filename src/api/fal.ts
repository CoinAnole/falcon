import { MODELS, aspectToGptSize, type AspectRatio, type Resolution } from "./models";

const FAL_BASE_URL = "https://fal.run";

export interface GenerateOptions {
  prompt: string;
  model: string;
  aspect?: AspectRatio;
  resolution?: Resolution;
  numImages?: number;
  editImage?: string; // base64 data URL for edit mode
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
  if (_apiKey) return _apiKey;

  // Check environment variable
  const envKey = process.env.FAL_KEY;
  if (envKey) return envKey;

  throw new Error("FAL_KEY not found. Set FAL_KEY environment variable or configure in ~/.falky/config.json");
}

export async function generate(options: GenerateOptions): Promise<FalResponse> {
  const { prompt, model, aspect = "9:16", resolution = "2K", numImages = 1, editImage } = options;

  const config = MODELS[model];
  if (!config) {
    throw new Error(`Unknown model: ${model}`);
  }

  let endpoint = `${FAL_BASE_URL}/${config.endpoint}`;

  // Build request body based on model capabilities
  const body: Record<string, unknown> = { prompt };

  if (model === "gpt") {
    body.image_size = aspectToGptSize(aspect);
    body.quality = "high";
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

  // Handle edit mode
  if (editImage) {
    if (!config.supportsEdit) {
      throw new Error(`Model ${model} does not support image editing`);
    }
    endpoint = `${endpoint}/edit`;
    body.image_urls = [editImage];
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
  const { imageUrl, model = "clarity", scaleFactor = 2, creativity = 0 } = options;

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

  return data as FalResponse;
}

export async function removeBackground(options: RemoveBackgroundOptions): Promise<FalResponse> {
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

  return data as FalResponse;
}

// Re-export for convenience
export { getApiKey, setApiKey };
