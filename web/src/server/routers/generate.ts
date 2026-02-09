import { z } from "zod";
import { type AspectRatio, estimateCost, type Resolution } from "@/lib/models";
import { generate as falGenerate } from "../fal";
import { stow } from "../stow";
import { publicProcedure, router } from "../trpc";

const aspectSchema = z.enum([
	"21:9",
	"16:9",
	"3:2",
	"4:3",
	"5:4",
	"1:1",
	"4:5",
	"3:4",
	"2:3",
	"9:16",
]);
const resolutionSchema = z.enum(["1K", "2K", "4K"]);
const modelSchema = z.enum(["gpt", "banana", "gemini", "gemini3"]);

export const generateRouter = router({
	/** Get a presigned URL for uploading a reference image to Stow */
	getUploadUrl: publicProcedure
		.input(
			z.object({
				contentType: z.string(),
				fileName: z.string(),
				size: z
					.number()
					.int()
					.max(10 * 1024 * 1024), // 10MB max
			})
		)
		.mutation(async ({ input }) => {
			const stowClient = stow();
			const ext = input.fileName.split(".").pop() || "png";
			const filename = `references/ref-${crypto.randomUUID()}.${ext}`;

			const result = await stowClient.getPresignedUrl({
				filename,
				contentType: input.contentType,
				size: input.size,
				metadata: { type: "reference", source: "falcon-web" },
			});

			return { uploadUrl: result.uploadUrl, fileKey: result.fileKey };
		}),

	/** Confirm a presigned upload after the client has uploaded to R2 */
	confirmUpload: publicProcedure
		.input(
			z.object({
				fileKey: z.string(),
				size: z.number().int(),
				contentType: z.string(),
			})
		)
		.mutation(async ({ input }) => {
			const stowClient = stow();
			const result = await stowClient.confirmUpload({
				fileKey: input.fileKey,
				size: input.size,
				contentType: input.contentType,
				metadata: { type: "reference", source: "falcon-web" },
			});

			return { url: result.url, key: result.key };
		}),

	/** Generate images — returns fal.ai URLs immediately */
	create: publicProcedure
		.input(
			z.object({
				prompt: z.string().min(1).max(4000),
				model: modelSchema.default("banana"),
				aspect: aspectSchema.default("1:1"),
				resolution: resolutionSchema.default("2K"),
				count: z.number().int().min(1).max(4).default(1),
				editImageUrls: z.array(z.string().url()).max(14).optional(),
				transparent: z.boolean().default(false),
				inputFidelity: z.enum(["low", "high"]).optional(),
			})
		)
		.mutation(async ({ input }) => {
			const {
				prompt,
				model,
				aspect,
				resolution,
				count,
				editImageUrls,
				transparent,
				inputFidelity,
			} = input;

			const result = await falGenerate({
				prompt,
				model,
				aspect: aspect as AspectRatio,
				resolution: resolution as Resolution,
				numImages: count,
				editImageUrls,
				transparent,
				inputFidelity,
			});

			const cost = estimateCost(model, resolution as Resolution, count);

			// Return fal.ai URLs immediately — client will call persist separately
			return {
				images: result.images.map((img, i) => ({
					falUrl: img.url,
					width: img.width,
					height: img.height,
					index: i,
				})),
				cost,
				model,
				prompt,
			};
		}),

	/** Upload fal.ai images to Stow for permanent storage */
	persist: publicProcedure
		.input(
			z.object({
				images: z.array(
					z.object({
						falUrl: z.string().url(),
						index: z.number(),
					})
				),
				prompt: z.string(),
				model: z.string(),
				aspect: z.string(),
				resolution: z.string(),
				cost: z.number(),
				editedFrom: z.string().optional(),
			})
		)
		.mutation(async ({ input }) => {
			const { images, prompt, model, aspect, resolution, cost, editedFrom } =
				input;
			const stowClient = stow();
			const timestamp = new Date().toISOString();

			const results = await Promise.all(
				images.map(async (img) => {
					const filename = `generated/falcon-${crypto.randomUUID()}.png`;

					const uploaded = await stowClient.uploadFromUrl(
						img.falUrl,
						filename,
						{
							metadata: {
								prompt,
								model,
								aspect,
								resolution,
								cost: (cost / images.length).toFixed(3),
								source: "falcon-web",
								timestamp,
								...(editedFrom ? { editedFrom } : {}),
							},
						}
					);

					return {
						index: img.index,
						key: uploaded.key,
						url: uploaded.url,
					};
				})
			);

			return { images: results };
		}),

	/** Generate variations — returns fal.ai URLs immediately */
	vary: publicProcedure
		.input(
			z.object({
				imageUrl: z.string().url(),
				prompt: z.string().optional(),
				model: modelSchema.default("banana"),
				aspect: aspectSchema.default("1:1"),
				resolution: resolutionSchema.default("2K"),
				count: z.number().int().min(1).max(4).default(4),
			})
		)
		.mutation(async ({ input }) => {
			const { imageUrl, prompt, model, aspect, resolution, count } = input;

			const result = await falGenerate({
				prompt: prompt || "Generate a variation of this image",
				model,
				aspect: aspect as AspectRatio,
				resolution: resolution as Resolution,
				numImages: count,
				editImageUrls: [imageUrl],
			});

			const cost = estimateCost(model, resolution as Resolution, count);

			return {
				images: result.images.map((img, i) => ({
					falUrl: img.url,
					width: img.width,
					height: img.height,
					index: i,
				})),
				cost,
				parentUrl: imageUrl,
				prompt: prompt || "variation",
				model,
				aspect,
				resolution,
			};
		}),
});
