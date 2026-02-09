import { z } from "zod";
import { stow } from "../stow";
import { publicProcedure, router } from "../trpc";

export const galleryRouter = router({
	list: publicProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(24),
				cursor: z.string().optional(),
			})
		)
		.query(async ({ input }) => {
			const stowClient = stow();

			const result = await stowClient.listFiles({
				prefix: "generated/",
				limit: input.limit,
				cursor: input.cursor,
			});

			return {
				images: result.files.map((f) => ({
					key: f.key,
					url: f.url,
					size: f.size,
					lastModified: f.lastModified,
					metadata: f.metadata,
				})),
				nextCursor: result.nextCursor,
			};
		}),
});
