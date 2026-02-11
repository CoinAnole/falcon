import { count, desc, lt, sum } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { images } from "@/db/schema";
import { stowUrl } from "../stow";
import { publicProcedure, router } from "../trpc";

export const galleryRouter = router({
	summary: publicProcedure.query(async () => {
		const [row] = await db
			.select({
				totalImages: count(),
				totalCost: sum(images.cost),
			})
			.from(images);

		return {
			totalImages: row?.totalImages ?? 0,
			totalCost: row?.totalCost ? Number.parseFloat(row.totalCost) : 0,
		};
	}),

	list: publicProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(24),
				cursor: z.string().optional(),
				direction: z.enum(["forward"]).default("forward"),
			})
		)
		.query(async ({ input }) => {
			const rows = await db
				.select()
				.from(images)
				.where(
					input.cursor
						? lt(images.createdAt, new Date(input.cursor))
						: undefined
				)
				.orderBy(desc(images.createdAt))
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
			const lastRow = pageRows.at(-1);
			const nextCursor =
				hasMore && lastRow ? lastRow.createdAt.toISOString() : null;

			return {
				images: pageRows.map((img) => ({
					key: img.stowKey,
					url: stowUrl(img.stowKey),
					metadata: {
						prompt: img.prompt || "",
						model: img.model || "",
						aspect: img.aspect || "",
						resolution: img.resolution || "",
						cost: img.cost || "",
						type: img.type,
					},
				})),
				nextCursor,
			};
		}),
});
