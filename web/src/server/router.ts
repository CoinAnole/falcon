import { galleryRouter } from "./routers/gallery";
import { generateRouter } from "./routers/generate";
import { processRouter } from "./routers/process";
import { router } from "./trpc";

export const appRouter = router({
	generate: generateRouter,
	process: processRouter,
	gallery: galleryRouter,
});

export type AppRouter = typeof appRouter;
