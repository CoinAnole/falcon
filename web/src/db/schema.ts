import {
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	type: text("type", {
		enum: ["generate", "vary", "upscale", "rmbg"],
	}).notNull(),
	status: text("status", {
		enum: ["queued", "processing", "completing", "completed", "failed"],
	})
		.notNull()
		.default("queued"),

	// fal.ai queue tracking
	falRequestId: text("fal_request_id"),
	falEndpoint: text("fal_endpoint").notNull(),

	// Key fields promoted for queryability
	prompt: text("prompt"),
	model: text("model").notNull(),

	// Full input params (for replay/debugging)
	input: jsonb("input").notNull(),

	// Result (populated on completion)
	result: jsonb("result"),
	error: text("error"),

	// Cost
	estimatedCost: numeric("estimated_cost", { precision: 10, scale: 4 }),

	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	startedAt: timestamp("started_at"),
	completedAt: timestamp("completed_at"),
});

export const images = pgTable(
	"images",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),

		// Storage — URL derived from stowKey at query time
		stowKey: text("stow_key").notNull().unique(),

		// Dimensions
		width: integer("width"),
		height: integer("height"),

		// Metadata (denormalized from job for fast gallery queries)
		prompt: text("prompt"),
		model: text("model"),
		aspect: text("aspect"),
		resolution: text("resolution"),
		type: text("type", {
			enum: ["generated", "variation", "upscale", "rmbg"],
		}).notNull(),

		// Lineage
		parentImageId: text("parent_image_id"),

		// Cost (per-image share of job cost)
		cost: numeric("cost", { precision: 10, scale: 4 }),

		// Timestamps
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("images_created_at_idx").on(table.createdAt),
		index("images_type_idx").on(table.type),
	]
);
