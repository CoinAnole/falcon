# Queue-Based Generation with Database Tracking

## Overview
Replace the synchronous fal.ai call (`fal.run`) with their queue API (`queue.fal.run`), add Postgres (Neon) via Drizzle ORM to track all jobs and images, and create a typographic countdown UX for the generation wait.

## Architecture

### Current flow (synchronous)
```
Client → tRPC mutation → fal.run (blocks 5-30s) → return images → persist to Stow
```

### New flow (queue + database)
```
Client → submit mutation → insert job → POST queue.fal.run → return jobId
Client polls status query → server checks fal queue → returns status/position/logs
Client shows typographic countdown
Client sees COMPLETED → calls complete mutation → server persists → returns images
```

The key insight: **status is read-only, completion is a separate mutation with an atomic lock.**

---

## Database Schema (Drizzle + Neon Postgres)

### `jobs` table

```typescript
export const jobs = pgTable("jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type", { enum: ["generate", "vary", "upscale", "rmbg"] }).notNull(),
  status: text("status", {
    enum: ["queued", "processing", "completing", "completed", "failed"]
  }).notNull().default("queued"),

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
```

**Status transitions:** `queued → processing → completing → completed` or `→ failed`
- `completing` is the lock state — only one caller can claim it via atomic UPDATE.

### `images` table

```typescript
export const images = pgTable("images", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),

  // Storage — URL derived from stowKey at query time, not stored
  stowKey: text("stow_key").notNull().unique(),

  // Dimensions
  width: integer("width"),
  height: integer("height"),

  // Metadata (denormalized from job for fast gallery queries)
  prompt: text("prompt"),
  model: text("model"),
  aspect: text("aspect"),
  resolution: text("resolution"),
  type: text("type", { enum: ["generated", "variation", "upscale", "rmbg"] }).notNull(),

  // Lineage
  parentImageId: text("parent_image_id"),

  // Cost (per-image share of job cost)
  cost: numeric("cost", { precision: 10, scale: 4 }),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**No `url` column** — URLs are derived from stowKey using a helper:
```typescript
function stowUrl(key: string): string {
  return `https://${process.env.STOW_BUCKET}.stow.sh/${key}`;
}
```

**`jobId` is nullable** — backfilled images from Stow have no corresponding job.

**No `cost_ledger` table** — cost is tracked on `jobs.estimatedCost`. Sum across jobs for totals. One table, one source of truth.

---

## Server Changes

### New: `web/src/db/index.ts`
```typescript
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });
```

### New: `web/src/db/schema.ts`
Both tables above, plus indexes on `images.createdAt` and `images.type`.

### Modified: `web/src/server/fal.ts`
Add queue functions. Keep existing sync `generate()` for now (upscale/rmbg stay sync).

```typescript
export async function submitToQueue(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ requestId: string; responseUrl: string }> {
  const response = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Queue submit failed: ${response.status} ${text}`);
  }
  const data = await response.json();
  return { requestId: data.request_id, responseUrl: data.response_url };
}

export async function getQueueStatus(
  endpoint: string,
  requestId: string
): Promise<{
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
  queuePosition?: number;
  logs?: { message: string; timestamp: string }[];
}> {
  const url = `https://queue.fal.run/${endpoint}/requests/${requestId}/status?logs=1`;
  const response = await fetch(url, {
    headers: { Authorization: `Key ${getApiKey()}` },
  });
  return response.json();
}

export async function getQueueResult(
  endpoint: string,
  requestId: string
): Promise<FalResponse> {
  const url = `https://queue.fal.run/${endpoint}/requests/${requestId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Key ${getApiKey()}` },
  });
  const data = await response.json();
  if ("detail" in data) throw new Error(data.detail);
  // Normalize response (same as existing logic)
  if ("image" in data && !("images" in data)) {
    return { images: [data.image] } as FalResponse;
  }
  return data as FalResponse;
}
```

### Modified: `web/src/server/routers/generate.ts`

**`submit` mutation** (replaces `create`):
1. Validate input, build fal.ai request body (same logic as current `create`)
2. Submit to fal queue → get `requestId`
3. Insert job row: status `"queued"`, all params
4. Return `{ jobId }` immediately

**`status` query** (read-only):
1. Look up job by ID from DB
2. If `completed` → return images from DB (with derived URLs)
3. If `failed` → return error
4. If `completing` → return `{ status: "completing" }` (tell client to wait)
5. If `queued` or `processing` → call `getQueueStatus()` from fal
6. If fal says `IN_PROGRESS` and job is still `queued` → update to `processing`, set `startedAt`
7. If fal says `COMPLETED` → return `{ status: "completed_pending" }` (tell client to call `complete`)
8. Return current status + queuePosition + logs + elapsed time

**`complete` mutation** (idempotent, with atomic lock):
1. Atomic: `UPDATE jobs SET status = 'completing' WHERE id = ? AND status IN ('queued', 'processing')`
2. If 0 rows affected → job already completing/completed. Query job, return result if available, or tell client to poll.
3. Fetch result from fal: `getQueueResult(endpoint, requestId)`
4. Store result in job row
5. Persist each image to Stow in parallel via `uploadFromUrl`
6. Insert image rows in DB
7. Update job: `status = 'completed'`, `completedAt = now()`
8. Return images with derived URLs

**If Stow upload fails:**
- Job stays in `completing` state
- Client retries `complete` mutation — but the lock check sees `completing`, so it returns a "still completing" response
- Add a staleness check: if job has been `completing` for > 60s, allow retry by resetting to `processing`

**`vary` mutation** — same submit pattern as `submit`, but with reference image URL.

### Modified: `web/src/server/routers/gallery.ts`
Query DB instead of Stow. Derive URLs from stowKey.

```typescript
list: publicProcedure
  .input(z.object({ limit: z.number().default(24), cursor: z.string().optional() }))
  .query(async ({ input }) => {
    const offset = input.cursor ? parseInt(input.cursor) : 0;
    const rows = await db.select()
      .from(images)
      .where(inArray(images.type, ["generated", "variation"]))
      .orderBy(desc(images.createdAt))
      .limit(input.limit + 1)
      .offset(offset);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, -1) : rows;

    return {
      images: items.map(img => ({
        key: img.stowKey,
        url: stowUrl(img.stowKey),
        metadata: {
          prompt: img.prompt || "",
          model: img.model || "",
          aspect: img.aspect || "",
          resolution: img.resolution || "",
          cost: img.cost || "",
        },
      })),
      nextCursor: hasMore ? String(offset + input.limit) : null,
    };
  }),
```

### Modified: `web/src/server/routers/process.ts`
Keep sync for upscale/rmbg (they're fast ~2-5s). But insert job + image rows in DB for tracking.

---

## Client Changes

### Modified: `web/src/app/page.tsx`

```typescript
const [activeJobId, setActiveJobId] = useState<string | null>(null);

const submitMutation = trpc.generate.submit.useMutation({
  onSuccess: (data) => setActiveJobId(data.jobId),
  onError: (err) => setError(err.message),
});

const statusQuery = trpc.generate.status.useQuery(
  { jobId: activeJobId! },
  {
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 1000;
      if (status === "completed" || status === "failed") return false;
      return 1000;
    },
  }
);

const completeMutation = trpc.generate.complete.useMutation({
  onSuccess: (data) => {
    setImages(data.images.map(img => ({
      key: img.stowKey,
      url: stowUrl(img.stowKey),
      width: img.width,
      height: img.height,
      metadata: { prompt: img.prompt, model: img.model, ... },
    })));
    setActiveJobId(null);
    utils.gallery.list.invalidate();
  },
  onError: () => {
    // Retry after short delay
    setTimeout(() => completeMutation.mutate({ jobId: activeJobId! }), 2000);
  },
});

// Trigger completion when fal is done
useEffect(() => {
  const status = statusQuery.data?.status;
  if (status === "completed_pending" && activeJobId && !completeMutation.isPending) {
    completeMutation.mutate({ jobId: activeJobId });
  }
  if (status === "completed") {
    // Already completed (e.g. page refresh), load images
    setImages(statusQuery.data.images);
    setActiveJobId(null);
  }
  if (status === "failed") {
    setError(statusQuery.data?.error || "Generation failed");
    setActiveJobId(null);
  }
}, [statusQuery.data]);
```

### New: `web/src/components/generation-status.tsx`

The typographic countdown — signature UX moment.

**Props:**
```typescript
interface GenerationStatusProps {
  status: "queued" | "processing" | "completing" | "completed_pending";
  queuePosition?: number;
  logs?: { message: string; timestamp: string }[];
  startedAt?: string; // ISO timestamp for elapsed time calculation
}
```

**Visual states:**

1. **Queued** — Queue position as giant monospace number
   ```
        3
    IN QUEUE
   ```

2. **Processing** — Elapsed time ticking up
   ```
      0:12
   GENERATING

   Loading pipeline...
   ```

3. **Completing** — Persist phase
   ```
      DONE
     SAVING
   ```

**Typography:**
- Main number/text: `font-mono text-[min(120px,15vw)] font-light tracking-tighter text-zinc-300`
- Status label: `text-[10px] font-medium uppercase tracking-widest text-text-tertiary`
- Log line: `font-mono text-[11px] text-zinc-400/50` — only the latest line, barely visible

**Behavior:**
- Queue position counts down as polls return decreasing values
- Elapsed time calculated client-side from `startedAt` timestamp (avoids clock sync issues)
- Log messages fade in/out with 150ms transition, showing only the most recent
- On transition to completing/done, the number fades out (150ms opacity)

---

## Migration Plan

### Phase 1: Database setup
1. Create Neon project via `neonctl`
2. Install packages: `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`
3. Create `web/src/db/schema.ts` and `web/src/db/index.ts`
4. Create `web/drizzle.config.ts`
5. Push schema to Neon: `npx drizzle-kit push`
6. Add `DATABASE_URL` to `web/.env.local`

### Phase 2: Queue generation + typographic countdown
1. Add `submitToQueue`, `getQueueStatus`, `getQueueResult` to `fal.ts`
2. Add `submit`, `status`, `complete` to generate router (keep old `create` temporarily)
3. Build `GenerationStatus` component
4. Update `page.tsx` to use submit → poll → complete flow
5. Test end-to-end: submit → countdown → images appear
6. Remove old `create` mutation once confirmed working

### Phase 3: Images catalog + gallery migration
1. Write backfill script: read all files from Stow `generated/` prefix, insert into `images` table with metadata
2. Run backfill
3. Switch gallery router to DB query
4. Verify gallery shows all images (old + new) in correct order
5. Update process router (upscale/rmbg) to also insert image rows

### Phase 4: Cost tracking
1. Cost is already on `jobs.estimatedCost` from Phase 2
2. Add `costs` router with summary query (sum by model, by day)
3. Display subtly in nav or sidebar footer

---

## Files

| File | Action | Phase |
|------|--------|-------|
| `web/src/db/index.ts` | New | 1 |
| `web/src/db/schema.ts` | New | 1 |
| `web/drizzle.config.ts` | New | 1 |
| `web/src/server/fal.ts` | Add queue functions | 2 |
| `web/src/server/routers/generate.ts` | submit + status + complete | 2 |
| `web/src/components/generation-status.tsx` | New — typographic countdown | 2 |
| `web/src/app/page.tsx` | Poll pattern | 2 |
| `web/src/server/routers/gallery.ts` | DB query | 3 |
| `web/src/server/routers/process.ts` | Insert job + image rows | 3 |
| `web/src/server/routers/costs.ts` | New — cost summary | 4 |
| `web/src/server/router.ts` | Add costs router | 4 |
| `scripts/backfill-images.ts` | One-time Stow → DB migration | 3 |

---

## Key Design Decisions

1. **Status is read-only, completion is a mutation with atomic lock.** Prevents race conditions from concurrent polls. The `completing` state acts as a mutex.

2. **No cost_ledger table.** Cost is on `jobs.estimatedCost`. `SELECT SUM(estimated_cost) FROM jobs WHERE status = 'completed'` is sufficient. One source of truth.

3. **No `url` column on images.** Derived from `stowKey` at query time. URLs are ephemeral; keys are permanent.

4. **`jobId` nullable on images.** Backfilled images have no job. Self-referential `parentImageId` is also just text (no FK constraint) to avoid circular dependency complexity.

5. **Backfill before gallery switch.** Phase 3 runs the backfill script before changing the gallery router. No window where old images are invisible.

6. **Upscale/rmbg stay synchronous.** They're 2-5s operations. Queue pattern would add latency (submit + poll overhead). Track in DB but don't change the UX.

7. **Polling at 1s with httpBatchLink.** No WebSocket/SSE infrastructure needed. For a single user, 1 HTTP request per second is negligible. React Query handles retries and deduplication.

---

## Verification
1. Submit → see queue position → see elapsed time → "DONE" → images appear
2. Close tab mid-generation → reopen → poll picks up active job from DB → resumes countdown
3. Two rapid submits → second waits for first to complete → no race conditions
4. Gallery shows all images (backfilled + new) in chronological order
5. Cost summary shows accurate totals per model
6. Upscale/rmbg still work instantly (sync) but appear in DB
7. `npx drizzle-kit studio` shows clean data in both tables
