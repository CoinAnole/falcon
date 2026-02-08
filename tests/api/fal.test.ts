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
});
