import { z } from "zod";
import { db } from "@/db";
import { images } from "@/db/schema";
import { removeBackground as falRemoveBg, upscale as falUpscale } from "../fal";
import { stow } from "../stow";
import { publicProcedure, router } from "../trpc";

export const processRouter = router({
	/** Upscale — returns fal.ai URL immediately */
	upscale: publicProcedure
		.input(
			z.object({
				imageUrl: z.string().url(),
				model: z.enum(["clarity", "crystal"]).default("clarity"),
				scaleFactor: z.number().int().min(2).max(8).default(2),
			})
		)
		.mutation(async ({ input }) => {
			const { imageUrl, model, scaleFactor } = input;

			const result = await falUpscale({ imageUrl, model, scaleFactor });

			const img = result.images[0];
			if (!img) {
				throw new Error("Upscale returned no image");
			}

			return {
				falUrl: img.url,
				width: img.width,
				height: img.height,
				cost: 0.02,
				parentUrl: imageUrl,
				model,
				scaleFactor,
			};
		}),

	/** Remove background — returns fal.ai URL immediately */
	removeBackground: publicProcedure
		.input(
			z.object({
				imageUrl: z.string().url(),
				model: z.enum(["rmbg", "bria"]).default("rmbg"),
			})
		)
		.mutation(async ({ input }) => {
			const { imageUrl, model } = input;

			const result = await falRemoveBg({ imageUrl, model });

			const img = result.images[0];
			if (!img) {
				throw new Error("Background removal returned no image");
			}

			return {
				falUrl: img.url,
				width: img.width,
				height: img.height,
				cost: 0.02,
				parentUrl: imageUrl,
				model,
			};
		}),

	/** Upload a processed image (upscale/rmbg) to Stow */
	persist: publicProcedure
		.input(
			z.object({
				falUrl: z.string().url(),
				type: z.enum(["upscale", "rmbg"]),
				parentUrl: z.string().url(),
				cost: z.string(),
				model: z.string().optional(),
				scaleFactor: z.number().optional(),
			})
		)
		.mutation(async ({ input }) => {
			const { falUrl, type, parentUrl, cost, model, scaleFactor } = input;
			const stowClient = stow();
			const filename = `falcon-${type}-${crypto.randomUUID()}.png`;

			const uploaded = await stowClient.uploadFromUrl(falUrl, filename, {
				metadata: {
					source: "falcon-web",
					type,
					parentUrl,
					cost,
					timestamp: new Date().toISOString(),
					...(model ? { [`${type}Model`]: model } : {}),
					...(scaleFactor ? { scaleFactor: scaleFactor.toString() } : {}),
				},
			});

			// Insert into images catalog
			await db.insert(images).values({
				stowKey: uploaded.key,
				type: type === "upscale" ? "upscale" : "rmbg",
				model: model || type,
				cost,
				parentImageId: parentUrl,
			});

			return {
				key: uploaded.key,
				url: uploaded.url,
			};
		}),
});
