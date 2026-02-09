import { afterEach, describe, expect, it } from "bun:test";
import {
	generate,
	removeBackground,
	setApiKey,
	upscale,
} from "../../src/api/fal";
import { withMockFetch } from "../helpers/fetch";

afterEach(() => {
	setApiKey("");
});

describe("fal api", () => {
	it("builds GPT payload with transparency", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "cat",
					model: "gpt",
					aspect: "9:16",
					transparent: true,
				});
			},
		);

		const call = calls[0];
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.image_size).toBe("1024x1536");
		expect(body.background).toBe("transparent");
		expect(body.output_format).toBe("png");
	});

	it("builds Flux 2 payload with guidance options", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "city",
					model: "flux2",
					aspect: "16:9",
					guidanceScale: 7,
					enablePromptExpansion: true,
					numInferenceSteps: 20,
					acceleration: "high",
					outputFormat: "webp",
				});
			},
		);

		const call = calls[0];
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.image_size).toBe("landscape_16_9");
		expect(body.guidance_scale).toBe(7);
		expect(body.enable_prompt_expansion).toBe(true);
		expect(body.num_inference_steps).toBe(20);
		expect(body.acceleration).toBe("high");
		expect(body.output_format).toBe("webp");
	});

	it("adds edit endpoint and image URLs", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "edit",
					model: "banana",
					editImage: "data:image/png;base64,abc",
				});
			},
		);

		const call = calls[0];
		expect(call.input.toString()).toContain("/edit");
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.image_urls).toEqual(["data:image/png;base64,abc"]);
	});

	it("throws on API error response", async () => {
		setApiKey("test-key");
		await withMockFetch(
			async () => {
				return Response.json({ detail: "Bad request" });
			},
			async () => {
				await expect(
					generate({ prompt: "bad", model: "banana" }),
				).rejects.toThrow("Bad request");
			},
		);
	});

	it("normalizes upscale response", async () => {
		setApiKey("test-key");
		const { result } = await withMockFetch(
			async () => {
				return Response.json({ image: { url: "https://example.com/x.png" } });
			},
			async () => {
				return await upscale({
					imageUrl: "data:image/png;base64,abc",
					model: "clarity",
				});
			},
		);

		expect(result.images).toHaveLength(1);
	});

	it("normalizes background removal response", async () => {
		setApiKey("test-key");
		const { result } = await withMockFetch(
			async () => {
				return Response.json({ image: { url: "https://example.com/x.png" } });
			},
			async () => {
				return await removeBackground({
					imageUrl: "data:image/png;base64,abc",
					model: "rmbg",
				});
			},
		);
		expect(result.images).toHaveLength(1);
	});

	it("includes seed in generate payload", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [], seed: 12345 });
			},
			async () => {
				await generate({
					prompt: "test",
					model: "banana",
					seed: 12345,
				});
			},
		);

		const call = calls[0];
		const body = JSON.parse(call.init?.body as string);
		expect(body.seed).toBe(12345);
	});

	it("includes seed in upscale payload", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({
					image: { url: "https://example.com/x.png" },
					seed: 54321,
				});
			},
			async () => {
				await upscale({
					imageUrl: "data:image/png;base64,abc",
					model: "clarity",
					seed: 54321,
				});
			},
		);

		const call = calls[0];
		const body = JSON.parse(call.init?.body as string);
		expect(body.seed).toBe(54321);
	});

	it("builds Banana payload with aspect_ratio, resolution, num_images and no output_format", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "test banana",
					model: "banana",
					aspect: "16:9",
					resolution: "4K",
					numImages: 2,
					outputFormat: "webp",
				});
			},
		);

		const call = calls[0];
		expect(call.input.toString()).toContain("fal-ai/nano-banana-pro");
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.aspect_ratio).toBe("16:9");
		expect(body.resolution).toBe("4K");
		expect(body.num_images).toBe(2);
		expect(body.output_format).toBeUndefined();
	});

	it("builds Gemini payload with aspect_ratio, num_images and no resolution", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "test gemini",
					model: "gemini",
					aspect: "4:3",
					resolution: "4K",
					numImages: 1,
				});
			},
		);

		const call = calls[0];
		expect(call.input.toString()).toContain("fal-ai/gemini-25-flash-image");
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.aspect_ratio).toBe("4:3");
		expect(body.num_images).toBe(1);
		expect(body.resolution).toBeUndefined();
	});

	it("builds Gemini3 payload with aspect_ratio, resolution, num_images, and output_format", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "test gemini3",
					model: "gemini3",
					aspect: "1:1",
					resolution: "2K",
					numImages: 3,
					outputFormat: "png",
				});
			},
		);

		const call = calls[0];
		expect(call.input.toString()).toContain(
			"fal-ai/gemini-3-pro-image-preview",
		);
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.aspect_ratio).toBe("1:1");
		expect(body.resolution).toBe("2K");
		expect(body.num_images).toBe(3);
		expect(body.output_format).toBe("png");
	});

	it("builds Imagine payload with aspect_ratio, num_images, output_format and correct endpoint", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "test imagine",
					model: "imagine",
					aspect: "16:9",
					numImages: 2,
					outputFormat: "webp",
				});
			},
		);

		const call = calls[0];
		expect(call.input.toString()).toContain("xai/grok-imagine-image");
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.aspect_ratio).toBe("16:9");
		expect(body.num_images).toBe(2);
		expect(body.output_format).toBe("webp");
	});
});
