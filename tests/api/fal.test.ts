// Import env helper FIRST to set process.env.HOME before config.ts is loaded

import "../helpers/env";

import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import {
	generate,
	removeBackground,
	setApiKey,
	upscale,
} from "../../src/api/fal";
import { GENERATION_MODELS, MODELS } from "../../src/api/models";
import { getTestHome } from "../helpers/env";
import { withMockFetch } from "../helpers/fetch";

const HTTP_500_ERROR_REGEX = /500.*Internal Server Error/;
const HTTP_503_ERROR_REGEX = /503.*Service Unavailable/;
const HTTP_403_ERROR_REGEX = /403.*Forbidden/;

afterEach(() => {
	setApiKey("");
});

describe("fal api", () => {
	it("builds GPT payload with transparency", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "cat",
					model: "gpt",
					aspect: "9:16",
					transparent: true,
				});
			}
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
			() => {
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
			}
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

	it("uses explicit 512x512 image_size object for Flux models", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "pixel robot",
					model: "flux2Flash",
					aspect: "16:9",
					resolution: "512x512",
				});
			}
		);

		const call = calls[0];
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.image_size).toEqual({ width: 512, height: 512 });
	});

	it("adds edit endpoint and image URLs for legacy editImage alias", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => {
				return Response.json({ images: [] });
			},
			async () => {
				await generate({
					prompt: "edit",
					model: "banana",
					editImage: "data:image/png;base64,abc",
				});
			}
		);

		const call = calls[0];
		expect(call.input.toString()).toContain("/edit");
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.image_urls).toEqual(["data:image/png;base64,abc"]);
	});

	it("sends multiple edit images via image_urls for multi-input models", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "edit",
					model: "banana",
					editImages: [
						"data:image/png;base64,abc",
						"data:image/png;base64,def",
					],
				});
			}
		);

		const call = calls[0];
		expect(call.input.toString()).toContain("/edit");
		const body = JSON.parse(call.init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.image_urls).toEqual([
			"data:image/png;base64,abc",
			"data:image/png;base64,def",
		]);
		expect(body.image_url).toBeUndefined();
	});

	it("uses image_url for single-input edit models", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "edit",
					model: "imagine",
					editImages: ["data:image/png;base64,abc"],
				});
			}
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.image_url).toBe("data:image/png;base64,abc");
		expect(body.image_urls).toBeUndefined();
	});

	it("throws when single-input edit model receives multiple input images", async () => {
		setApiKey("test-key");
		await expect(
			generate({
				prompt: "edit",
				model: "imagine",
				editImages: ["data:image/png;base64,abc", "data:image/png;base64,def"],
			})
		).rejects.toThrow("supports at most 1 edit input image");
	});

	it("throws when Flux edit receives more than 4 input images", async () => {
		setApiKey("test-key");
		await expect(
			generate({
				prompt: "edit",
				model: "flux2",
				editImages: [
					"data:image/png;base64,1",
					"data:image/png;base64,2",
					"data:image/png;base64,3",
					"data:image/png;base64,4",
					"data:image/png;base64,5",
				],
			})
		).rejects.toThrow("supports at most 4 edit input images");
	});

	it("throws on API error response", async () => {
		setApiKey("test-key");
		await withMockFetch(
			() => {
				return Response.json({ detail: "Bad request" });
			},
			async () => {
				await expect(
					generate({ prompt: "bad", model: "banana" })
				).rejects.toThrow("Bad request");
			}
		);
	});

	it("normalizes upscale response", async () => {
		setApiKey("test-key");
		const { result } = await withMockFetch(
			() => {
				return Response.json({ image: { url: "https://example.com/x.png" } });
			},
			async () => {
				return await upscale({
					imageUrl: "data:image/png;base64,abc",
					model: "clarity",
				});
			}
		);

		expect(result.images).toHaveLength(1);
	});

	it("normalizes background removal response", async () => {
		setApiKey("test-key");
		const { result } = await withMockFetch(
			() => {
				return Response.json({ image: { url: "https://example.com/x.png" } });
			},
			async () => {
				return await removeBackground({
					imageUrl: "data:image/png;base64,abc",
					model: "rmbg",
				});
			}
		);
		expect(result.images).toHaveLength(1);
	});

	it("includes seed in generate payload", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => {
				return Response.json({ images: [], seed: 12_345 });
			},
			async () => {
				await generate({
					prompt: "test",
					model: "banana",
					seed: 12_345,
				});
			}
		);

		const call = calls[0];
		const body = JSON.parse(call.init?.body as string);
		expect(body.seed).toBe(12_345);
	});

	it("includes seed in upscale payload", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => {
				return Response.json({
					image: { url: "https://example.com/x.png" },
					seed: 54_321,
				});
			},
			async () => {
				await upscale({
					imageUrl: "data:image/png;base64,abc",
					model: "clarity",
					seed: 54_321,
				});
			}
		);

		const call = calls[0];
		const body = JSON.parse(call.init?.body as string);
		expect(body.seed).toBe(54_321);
	});

	it("builds Banana payload with aspect_ratio, resolution, num_images and no output_format", async () => {
		setApiKey("test-key");
		const { calls } = await withMockFetch(
			() => {
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
			}
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
			() => {
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
			}
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
			() => {
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
			}
		);

		const call = calls[0];
		expect(call.input.toString()).toContain(
			"fal-ai/gemini-3-pro-image-preview"
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
			() => {
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
			}
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
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test numImages",
					model: "gemini3",
					numImages: 3,
				});
			}
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
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test default numImages",
					model: "gemini3",
				});
			}
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
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test outputFormat",
					model: "gemini3",
					outputFormat: "webp",
				});
			}
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
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test no outputFormat",
					model: "banana",
					outputFormat: "webp",
				});
			}
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
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test resolution",
					model: "banana",
					resolution: "4K",
				});
			}
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
			() => Response.json({ images: [] }),
			async () => {
				await generate({
					prompt: "test no resolution",
					model: "gemini",
					resolution: "4K",
				});
			}
		);

		const body = JSON.parse(calls[0].init?.body as string) as Record<
			string,
			unknown
		>;
		expect(body.resolution).toBeUndefined();
	});

	it("rejects 512x512 resolution for models that require enum resolutions", async () => {
		setApiKey("test-key");
		await withMockFetch(
			() => Response.json({ images: [] }),
			async () => {
				await expect(
					generate({
						prompt: "test unsupported resolution",
						model: "banana",
						resolution: "512x512",
					})
				).rejects.toThrow("does not support 512x512 resolution");
			}
		);
	});

	it("uses bria endpoint and normalizes single-image response for removeBackground with model bria", async () => {
		setApiKey("test-key");
		const { calls, result } = await withMockFetch(
			() => {
				return Response.json({
					image: { url: "https://example.com/bria-result.png" },
				});
			},
			async () => {
				return await removeBackground({
					imageUrl: "data:image/png;base64,abc",
					model: "bria",
				});
			}
		);

		// Requirement 7.1: Verify endpoint URL contains bria endpoint
		const call = calls[0];
		expect(call.input.toString()).toContain("fal-ai/bria/background/remove");

		// Requirement 7.2: Verify response is normalized to images array format
		expect(result.images).toHaveLength(1);
		expect(result.images[0].url).toBe("https://example.com/bria-result.png");
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
					generate({ prompt: "fail", model: "banana" })
				).rejects.toThrow(HTTP_500_ERROR_REGEX);
			}
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
					})
				).rejects.toThrow(HTTP_503_ERROR_REGEX);
			}
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
					})
				).rejects.toThrow(HTTP_403_ERROR_REGEX);
			}
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
			process.env.FAL_KEY = undefined;
		}
	});

	it("uses setApiKey value in Authorization header when set", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("manual-key-priority");

		const { calls } = await withMockFetch(
			() => Response.json({ images: [] }),
			async () => {
				await generate({ prompt: "test", model: "banana" });
			}
		);

		const authHeader = calls[0].init?.headers as Record<string, string>;
		expect(authHeader.Authorization).toBe("Key manual-key-priority");
	});

	it("falls back to FAL_KEY env var when setApiKey is cleared", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("");
		process.env.FAL_KEY = "env-var-key";

		const { calls } = await withMockFetch(
			() => Response.json({ images: [] }),
			async () => {
				await generate({ prompt: "test", model: "banana" });
			}
		);

		const authHeader = calls[0].init?.headers as Record<string, string>;
		expect(authHeader.Authorization).toBe("Key env-var-key");
	});

	it("falls back to config file apiKey when setApiKey and env var are cleared", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("");
		process.env.FAL_KEY = undefined;

		// Write config file with apiKey to the isolated test HOME
		const testHome = getTestHome();
		process.env.HOME = testHome;
		const falconDir = join(testHome, ".falcon");
		mkdirSync(falconDir, { recursive: true });
		writeFileSync(
			join(falconDir, "config.json"),
			JSON.stringify({ apiKey: "config-file-key" })
		);

		// Re-import to pick up the fresh HOME/config
		// loadConfig reads process.env.HOME at call time via FALCON_DIR
		const { calls } = await withMockFetch(
			() => Response.json({ images: [] }),
			async () => {
				await generate({ prompt: "test", model: "banana" });
			}
		);

		const authHeader = calls[0].init?.headers as Record<string, string>;
		expect(authHeader.Authorization).toBe("Key config-file-key");
	});

	it("throws FAL_KEY not found when no key is available from any source", async () => {
		savedFalKey = process.env.FAL_KEY;
		setApiKey("");
		process.env.FAL_KEY = undefined;

		// Write config file without apiKey to the isolated test HOME
		const testHome = getTestHome();
		process.env.HOME = testHome;
		const falconDir = join(testHome, ".falcon");
		mkdirSync(falconDir, { recursive: true });
		writeFileSync(
			join(falconDir, "config.json"),
			JSON.stringify({ defaultModel: "banana" })
		);

		await expect(generate({ prompt: "test", model: "banana" })).rejects.toThrow(
			"FAL_KEY not found"
		);
	});
});

// --- Task 7.1: Property 1 — HTTP error propagation across all API functions ---
// Feature: phase2-api-layer-tests, Property 1: HTTP error propagation across all API functions

describe("property-based tests", () => {
	// Feature: phase2-api-layer-tests, Property 1: HTTP error propagation across all API functions
	/**
	 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
	 *
	 * For any API function and any HTTP status code in 400–599,
	 * the thrown error contains the status code and body text.
	 */
	it("Property 1: HTTP error propagation across all API functions", async () => {
		await fc.assert(
			fc.asyncProperty(
				// Pick one of the three API functions
				fc.constantFrom("generate", "upscale", "removeBackground"),
				// Random HTTP error status code in 400–599
				fc.integer({ min: 400, max: 599 }),
				// Random non-empty body string
				fc.string({ minLength: 1, maxLength: 50 }),
				async (fnName, statusCode, bodyText) => {
					setApiKey("test-key");

					try {
						await withMockFetch(
							async () =>
								new Response(bodyText, {
									status: statusCode,
									statusText: "ErrorStatus",
								}),
							async () => {
								if (fnName === "generate") {
									await generate({ prompt: "test", model: "banana" });
								} else if (fnName === "upscale") {
									await upscale({ imageUrl: "https://example.com/img.png" });
								} else {
									await removeBackground({
										imageUrl: "https://example.com/img.png",
									});
								}
							}
						);
						// Should not reach here — the function must throw
						return false;
					} catch (err: unknown) {
						const message = (err as Error).message;
						// Error message must contain the numeric status code
						const containsStatusCode = message.includes(String(statusCode));
						// Error message must contain the body text
						const containsBody = message.includes(bodyText);
						return containsStatusCode && containsBody;
					}
				}
			),
			{ numRuns: 50 }
		);
	}, 30_000);

	// Feature: phase2-api-layer-tests, Property 2: Endpoint and prompt invariant for all generation models
	/**
	 * Validates: Requirements 8.1, 8.4
	 *
	 * For any generation model key from GENERATION_MODELS, when generate is called
	 * with that model and a prompt string, the captured request URL should contain
	 * the model's configured endpoint from MODELS[model].endpoint, and the request
	 * body should contain the prompt field set to the provided string.
	 */
	it("Property 2: Endpoint and prompt invariant for all generation models", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(...GENERATION_MODELS),
				fc.string({ minLength: 1 }),
				async (model, prompt) => {
					setApiKey("test-key");

					const { calls } = await withMockFetch(
						() => Response.json({ images: [] }),
						async () => {
							await generate({ prompt, model });
						}
					);

					const call = calls[0];
					const url = call.input.toString();
					const body = JSON.parse(call.init?.body as string) as Record<
						string,
						unknown
					>;

					const expectedEndpoint = MODELS[model].endpoint;

					// Request URL must contain the model's configured endpoint
					expect(url).toContain(expectedEndpoint);

					// Request body must contain the prompt field matching the provided string
					expect(body.prompt).toBe(prompt);
				}
			),
			{ numRuns: 50 }
		);
	}, 30_000);

	// Feature: phase2-api-layer-tests, Property 3: Capability flags control payload fields
	/**
	 * Validates: Requirements 8.2, 8.3, 8.5
	 *
	 * For any generation model key from GENERATION_MODELS (excluding GPT and Flux2
	 * variants which use special payload logic), when generate is called with an
	 * aspect ratio, resolution, numImages, and outputFormat, the payload fields
	 * match the model's capability flags:
	 * - supportsAspect → aspect_ratio present
	 * - supportsNumImages → num_images present
	 * - supportsOutputFormat → output_format present; otherwise absent
	 * - supportsResolution → resolution present; otherwise absent
	 */
	it("Property 3: Capability flags control payload fields", async () => {
		const eligibleModels = GENERATION_MODELS.filter(
			(m) => m !== "gpt" && !m.startsWith("flux2")
		);

		await fc.assert(
			fc.asyncProperty(fc.constantFrom(...eligibleModels), async (model) => {
				setApiKey("test-key");

				const { calls } = await withMockFetch(
					() => Response.json({ images: [] }),
					async () => {
						await generate({
							prompt: "test capability flags",
							model,
							aspect: "16:9",
							resolution: "4K",
							numImages: 2,
							outputFormat: "webp",
						});
					}
				);

				const call = calls[0];
				const body = JSON.parse(call.init?.body as string) as Record<
					string,
					unknown
				>;
				const config = MODELS[model];

				// supportsAspect → aspect_ratio present
				if (config.supportsAspect) {
					expect(body.aspect_ratio).toBe("16:9");
				}

				// supportsNumImages → num_images present
				if (config.supportsNumImages) {
					expect(body.num_images).toBe(2);
				}

				// supportsOutputFormat → output_format present; otherwise absent
				if (config.supportsOutputFormat) {
					expect(body.output_format).toBe("webp");
				} else {
					expect(body.output_format).toBeUndefined();
				}

				// supportsResolution → resolution present; otherwise absent
				if (config.supportsResolution) {
					expect(body.resolution).toBe("4K");
				} else {
					expect(body.resolution).toBeUndefined();
				}
			}),
			{ numRuns: 50 }
		);
	}, 30_000);
});
