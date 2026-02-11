import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { images, jobs } from "@/db/schema";
import { type AspectRatio, estimateCost, type Resolution } from "@/lib/models";
import {
	buildGenerateBody,
	getQueueResult,
	getQueueStatus,
	submitToQueue,
} from "../fal";
import { stow, stowUrl } from "../stow";
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
					.max(10 * 1024 * 1024),
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

	/** Submit a generation to the fal.ai queue — returns jobId immediately */
	submit: publicProcedure
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

			// Build the fal.ai request body
			const { endpoint, body } = buildGenerateBody({
				prompt,
				model,
				aspect: aspect as AspectRatio,
				resolution: resolution as Resolution,
				numImages: count,
				editImageUrls,
				transparent,
				inputFidelity,
			});

			// Submit to queue
			const queued = await submitToQueue(endpoint, body);

			const cost = estimateCost(model, resolution as Resolution, count);

			// Insert job row
			const jobId = crypto.randomUUID();
			await db.insert(jobs).values({
				id: jobId,
				type: "generate",
				status: "queued",
				falRequestId: queued.requestId,
				falEndpoint: endpoint,
				prompt,
				model,
				input: {
					prompt,
					model,
					aspect,
					resolution,
					count,
					editImageUrls,
					transparent,
					inputFidelity,
				},
				estimatedCost: cost.toFixed(4),
			});

			return { jobId };
		}),

	/** Submit a variation to the fal.ai queue */
	submitVary: publicProcedure
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
			const effectivePrompt = prompt || "Generate a variation of this image";

			const { endpoint, body } = buildGenerateBody({
				prompt: effectivePrompt,
				model,
				aspect: aspect as AspectRatio,
				resolution: resolution as Resolution,
				numImages: count,
				editImageUrls: [imageUrl],
			});

			const queued = await submitToQueue(endpoint, body);
			const cost = estimateCost(model, resolution as Resolution, count);

			const jobId = crypto.randomUUID();
			await db.insert(jobs).values({
				id: jobId,
				type: "vary",
				status: "queued",
				falRequestId: queued.requestId,
				falEndpoint: endpoint,
				prompt: effectivePrompt,
				model,
				input: {
					prompt: effectivePrompt,
					model,
					aspect,
					resolution,
					count,
					parentUrl: imageUrl,
				},
				estimatedCost: cost.toFixed(4),
			});

			return { jobId };
		}),

	/** Poll job status — read-only, never triggers side effects */
	status: publicProcedure
		.input(z.object({ jobId: z.string().uuid() }))
		.query(async ({ input }) => {
			const [job] = await db
				.select()
				.from(jobs)
				.where(eq(jobs.id, input.jobId))
				.limit(1);

			if (!job) {
				throw new Error("Job not found");
			}

			// Terminal states — return from DB
			if (job.status === "completed") {
				const jobImages = await db
					.select()
					.from(images)
					.where(eq(images.jobId, job.id));

				return {
					status: "completed" as const,
					images: jobImages.map((img) => ({
						stowKey: img.stowKey,
						url: stowUrl(img.stowKey),
						width: img.width,
						height: img.height,
						prompt: img.prompt,
						model: img.model,
						aspect: img.aspect,
						resolution: img.resolution,
						cost: img.cost,
					})),
				};
			}

			if (job.status === "failed") {
				return {
					status: "failed" as const,
					error: job.error || "Unknown error",
				};
			}

			if (job.status === "completing") {
				return { status: "completing" as const };
			}

			// Active states — check fal.ai queue
			if (!(job.falRequestId && job.falEndpoint)) {
				return {
					status: "failed" as const,
					error: "Missing fal.ai request info",
				};
			}

			const falStatus = await getQueueStatus(job.falEndpoint, job.falRequestId);

			// Update DB status if fal moved to IN_PROGRESS
			if (falStatus.status === "IN_PROGRESS" && job.status === "queued") {
				await db
					.update(jobs)
					.set({ status: "processing", startedAt: new Date() })
					.where(eq(jobs.id, job.id));
			}

			if (falStatus.status === "COMPLETED") {
				return { status: "ready_to_complete" as const };
			}

			return {
				status:
					falStatus.status === "IN_QUEUE"
						? ("queued" as const)
						: ("processing" as const),
				queuePosition: falStatus.queuePosition,
				logs: falStatus.logs,
				startedAt: job.startedAt?.toISOString(),
			};
		}),

	/** Complete a job — fetches result, persists to Stow, inserts image rows */
	complete: publicProcedure
		.input(z.object({ jobId: z.string().uuid() }))
		.mutation(async ({ input }) => {
			// Atomic lock: claim the job for completion
			const updated = await db
				.update(jobs)
				.set({ status: "completing" })
				.where(
					and(
						eq(jobs.id, input.jobId),
						inArray(jobs.status, ["queued", "processing"])
					)
				)
				.returning({ id: jobs.id });

			if (updated.length === 0) {
				// Job already completing or completed — check current state
				const [job] = await db
					.select()
					.from(jobs)
					.where(eq(jobs.id, input.jobId))
					.limit(1);

				if (!job) {
					throw new Error("Job not found");
				}

				if (job.status === "completed") {
					// Already done — return the images
					const jobImages = await db
						.select()
						.from(images)
						.where(eq(images.jobId, job.id));

					return {
						images: jobImages.map((img) => ({
							stowKey: img.stowKey,
							url: stowUrl(img.stowKey),
							width: img.width,
							height: img.height,
							prompt: img.prompt,
							model: img.model,
							aspect: img.aspect,
							resolution: img.resolution,
							cost: img.cost,
						})),
					};
				}

				if (job.status === "completing") {
					// Check for stale lock (> 60s)
					const lockAge = job.completedAt
						? 0
						: Date.now() -
							(job.startedAt?.getTime() || job.createdAt.getTime());

					if (lockAge > 60_000) {
						// Reset to processing so this call can retry
						await db
							.update(jobs)
							.set({ status: "processing" })
							.where(eq(jobs.id, job.id));
						throw new Error("Completion timed out, retrying");
					}

					throw new Error("Job is being completed by another request");
				}

				throw new Error(`Unexpected job status: ${job.status}`);
			}

			// We have the lock — fetch result from fal.ai
			const [job] = await db
				.select()
				.from(jobs)
				.where(eq(jobs.id, input.jobId))
				.limit(1);

			if (!(job?.falRequestId && job.falEndpoint)) {
				throw new Error("Missing fal.ai request info");
			}

			const falResult = await getQueueResult(job.falEndpoint, job.falRequestId);

			// Store fal result in job
			await db
				.update(jobs)
				.set({ result: falResult })
				.where(eq(jobs.id, job.id));

			// Persist to Stow + insert image rows
			const stowClient = stow();
			const jobInput = job.input as Record<string, unknown>;
			const timestamp = new Date().toISOString();

			const imageResults = await Promise.all(
				falResult.images.map(async (img) => {
					const filename = `generated/falcon-${crypto.randomUUID()}.png`;
					const perImageCost = job.estimatedCost
						? (Number(job.estimatedCost) / falResult.images.length).toFixed(4)
						: null;

					const uploaded = await stowClient.uploadFromUrl(img.url, filename, {
						metadata: {
							prompt: job.prompt || "",
							model: job.model,
							aspect: (jobInput.aspect as string) || "1:1",
							resolution: (jobInput.resolution as string) || "2K",
							cost: perImageCost || "0",
							source: "falcon-web",
							timestamp,
						},
					});

					// Insert image row
					const imageId = crypto.randomUUID();
					await db.insert(images).values({
						id: imageId,
						jobId: job.id,
						stowKey: uploaded.key,
						width: img.width,
						height: img.height,
						prompt: job.prompt,
						model: job.model,
						aspect: (jobInput.aspect as string) || "1:1",
						resolution: (jobInput.resolution as string) || "2K",
						type: job.type === "vary" ? "variation" : "generated",
						parentImageId: (jobInput.parentUrl as string) || null,
						cost: perImageCost,
					});

					return {
						stowKey: uploaded.key,
						url: stowUrl(uploaded.key),
						width: img.width,
						height: img.height,
						prompt: job.prompt,
						model: job.model,
						aspect: (jobInput.aspect as string) || "1:1",
						resolution: (jobInput.resolution as string) || "2K",
						cost: perImageCost,
					};
				})
			);

			// Mark job completed
			await db
				.update(jobs)
				.set({ status: "completed", completedAt: new Date() })
				.where(eq(jobs.id, job.id));

			return { images: imageResults };
		}),
});
