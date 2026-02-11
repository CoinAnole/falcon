import { StowServer } from "@howells/stow-server";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

const stow = new StowServer({
	apiKey: process.env.STOW_API_KEY,
	bucket: "falcon",
});
const sql = neon(process.env.DATABASE_URL);

async function backfill() {
	// Get all files from Stow
	const result = await stow.listFiles({ limit: 100 });
	const files = result.files.filter(
		(f) => !f.metadata || f.metadata.type !== "reference"
	);

	// Get existing DB keys
	const dbRows = await sql`SELECT stow_key FROM images`;
	const dbKeys = new Set(dbRows.map((r) => r.stow_key));

	const toInsert = files.filter((f) => !dbKeys.has(f.key));

	if (toInsert.length === 0) {
		console.log("Nothing to backfill — all images already in DB");
		return;
	}

	console.log(`Backfilling ${toInsert.length} images...`);

	for (const f of toInsert) {
		const meta = f.metadata || {};
		await sql`INSERT INTO images (id, stow_key, prompt, model, aspect, resolution, type, cost, created_at)
			VALUES (
				${crypto.randomUUID()},
				${f.key},
				${meta.prompt || null},
				${meta.model || "unknown"},
				${meta.aspect || null},
				${meta.resolution || null},
				${"generated"},
				${meta.cost || null},
				${f.lastModified || new Date().toISOString()}
			)`;
		console.log(`  ✓ ${f.key}`);
	}

	console.log("Done");
}

backfill().catch(console.error);
