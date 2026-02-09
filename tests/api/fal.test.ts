import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	generate,
	removeBackground,
	setApiKey,
	upscale,
} from "../../src/api/fal";
// Import env helper FIRST to set process.env.HOME before config.ts is loaded
import { getTestHome } from "../helpers/env";
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

	it("sets num_images to provided value when explicit", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test numImages",
					model: "gemini3",
					numImages: 3,
				});
			},
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.num_images).toBe(3);
	});

	it("defaults num_images to 1 when omitted", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test default numImages",
					model: "gemini3",
				});
			},
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.num_images).toBe(1);
	});

	it("includes output_format in payload for supporting model", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test outputFormat",
					model: "gemini3",
					outputFormat: "webp",
				});
			},
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.output_format).toBe("webp");
	});

	it("omits output_format from payload for non-supporting model", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test no outputFormat",
					model: "banana",
					outputFormat: "webp",
				});
			},
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.output_format).toBeUndefined();
	});

	it("includes resolution in payload for supporting model", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test resolution",
					model: "banana",
					resolution: "4K",
				});
			},
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.resolution).toBe("4K");
	});

	it("omits resolution from payload for non-supporting model", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test no resolution",
					model: "gemini",
					resolution: "4K",
				});
			},
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.resolution).toBeUndefined();
	});

	it("throws error with status code, status text, and body on generate HTTP failure", async () => {
		setApiKey("test-key");
		await withMockFetch(
			async () =>
				new Response("Internal Server Error", {
					status: 500,
					statusText: "Internal Server Error",
				}),
			async () => {
				await expect(
					generate({ prompt: "fail", model: "banana" }),
				).rejects.toThrow(/500.*Internal Server Error/);
			},
		);
	});

	it("throws error with status code, status text, and body on upscale HTTP failure", async () => {
		setApiKey("test-key");
		await withMockFetch(
			async () =>
				new Response("Service Unavailable", {
					status: 503,
					statusText: "Service Unavailable",
				}),
			async () => {
				await expect(
					upscale({
						imageUrl: "data:image/png;base64,abc",
						model: "clarity",
					}),
				).rejects.toThrow(/503.*Service Unavailable/);
			},
		);
	});

	it("throws error with status code, status text, and body on removeBackground HTTP failure", async () => {
		setApiKey("test-key");
		await withMockFetch(
			async () =>
				new Response("Forbidden", {
					status: 403,
					statusText: "Forbidden",
				}),
			async () => {
				await expect(
					removeBackground({
						imageUrl: "data:image/png;base64,abc",
						model: "rmbg",
					}),
				).rejects.toThrow(/403.*Forbidden/);
			},
		);
	});
});

describe("getApiKey fallback chain", () => {
	let savedFalKey: string | undefined;

	afterEach(() => {
		setApiKey("");
		// Restore FAL_KEY env var
		if (savedFalKey !== undefined) {
			process.env.FAL_KEY = savedFalKey;
		} else {
			delete process.env.FAL_KEY;
		}
	});

	it("uses setApiKey value in Authorization header when set", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("manual-key-priority");

		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({ prompt: "test", model: "banana" });
			},
		);

		const authHeader = calls[0].init?.headers as Record<string, string>;
		expect(authHeader.Authorization).toBe("Key manual-key-priority");
	});

	it("falls back to FAL_KEY env var when setApiKey is cleared", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("");
		process.env.FAL_KEY = "env-var-key";

		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({ prompt: "test", model: "banana" });
			},
		);

		const authHeader = calls[0].init?.headers as Record<string, string>;
		expect(authHeader.Authorization).toBe("Key env-var-key");
	});

	it("falls back to config file apiKey when setApiKey and env var are cleared", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("");
		delete process.env.FAL_KEY;

		// Write config file with apiKey to the isolated test HOME
		const testHome = getTestHome();
		process.env.HOME = testHome;
		const falconDir = join(testHome, ".falcon");
		mkdirSync(falconDir, { recursive: true });
		writeFileSync(
			join(falconDir, "config.json"),
			JSON.stringify({ apiKey: "config-file-key" }),
		);

		// Re-import to pick up the fresh HOME/config
		// loadConfig reads process.env.HOME at call time via FALCON_DIR
		const { calls } = await withMockFetch(
			async () => Response.json({ images: [] }),
			async () => {
				await generate({ prompt: "test", model: "banana" });
			},
		);

		const authHeader = calls[0].init?.headers as Record<string, string>;
		expect(authHeader.Authorization).toBe("Key config-file-key");
	});

	it("throws FAL_KEY not found when no key is available from any source", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("");
		delete process.env.FAL_KEY;

		// Write config file without apiKey to the isolated test HOME
		const testHome = getTestHome();
		process.env.HOME = testHome;
		const falconDir = join(testHome, ".falcon");
		mkdirSync(falconDir, { recursive: true });
		writeFileSync(
			join(falconDir, "config.json"),
			JSON.stringify({ defaultModel: "banana" }),
		);

		await expect(generate({ prompt: "test", model: "banana" })).rejects.toThrow(
			"FAL_KEY not found",
		);
	});
});
