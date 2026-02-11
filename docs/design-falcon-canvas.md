# Falcon Canvas — Design Specification

## Vision

Transform Falcon from a linear AI image generation tool into a **spatial creative workspace** — an infinite canvas where images, prompts, sketches, and annotations coexist. Think Figma meets AI image generation. The canvas becomes the primary interface for generating, compositing, organizing, and exploring AI imagery.

## Guiding Principles

1. **Canvas is the interface** — No separate forms or modes. Everything happens spatially.
2. **Figma-style contextual UX** — Tools in the toolbar, properties on the right, actions on selection.
3. **Connections are generative** — Linking images isn't just organizational; it triggers AI compositing.
4. **Everything persists** — Boards save automatically. You can close the tab and come back.
5. **Existing capabilities preserved** — All current generation, processing, and gallery features carry forward.

---

## Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FALCON CANVAS                                │
│                                                                      │
│  ┌──────────┐  ┌──────────────────────────────┐  ┌───────────────┐  │
│  │ Toolbar  │  │      tldraw Canvas            │  │  Properties   │  │
│  │          │  │                                │  │  Panel        │  │
│  │ Tools:   │  │  Custom Shapes:                │  │               │  │
│  │ • Select │  │  • AIImage                     │  │  Contextual:  │  │
│  │ • Hand   │  │  • GenerationFrame             │  │  • Image meta │  │
│  │ • Generate│ │  • SketchRegion                │  │  • Gen form   │  │
│  │ • Upload │  │  • StickyNote                  │  │  • Actions    │  │
│  │ • Text   │  │  • ColorSwatch                 │  │  • Board info │  │
│  │ • Draw   │  │                                │  │               │  │
│  │ • Note   │  │  tldraw Arrows = Connections   │  │               │  │
│  │ • Color  │  │  (reference links for composites)│ │               │  │
│  │          │  │                                │  │               │  │
│  │──────────│  │  Board State → JSON            │  │               │  │
│  │ Assets   │  │  Auto-saved to DB              │  │               │  │
│  │ Panel    │  │                                │  │               │  │
│  │ (toggle) │  │                                │  │               │  │
│  └──────────┘  └──────────────────────────────┘  └───────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │ Top Bar: ◆ falcon | Board: "Name" ▾ | [+ New] | [Gallery]       ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐        ┌──────────┐         ┌──────────┐
    │ tRPC    │        │ tRPC     │         │ tRPC     │
    │ generate│        │ process  │         │ board    │
    │ router  │        │ router   │         │ router   │
    └────┬────┘        └────┬─────┘         └────┬─────┘
         │                  │                    │
    ┌────▼────┐        ┌────▼─────┐         ┌───▼──────┐
    │ fal.ai  │        │ fal.ai   │         │ Postgres │
    │ Queue   │        │ Sync     │         │ (boards) │
    └─────────┘        └──────────┘         └──────────┘
         │                  │
         ▼                  ▼
    ┌─────────────────────────┐
    │     Stow (R2)           │
    │  Image Storage          │
    └─────────────────────────┘
```

---

## Layout & Navigation

### Top Bar
```
◆ falcon   │  Board: "Brand Exploration" ▾   [+ New Board]   │   Gallery
```
- **Logo**: Links to board list / home
- **Board Selector**: Dropdown showing all boards, rename inline, delete
- **New Board**: Creates blank canvas
- **Gallery**: Links to full gallery page (existing, preserved)

### Left Panel — Toolbar + Assets

**Toolbar** (icon strip, always visible):
| Tool | Icon | Behavior |
|------|------|----------|
| Select (V) | ↖ | Default. Click to select shapes, drag to move. |
| Hand (H) | ✋ | Pan canvas. Also: hold Space + drag. |
| Generate (G) | ✦ | Draw a frame → becomes GenerationFrame. Right panel shows gen controls. |
| Upload (U) | ↑ | Click canvas to place upload picker, or drag file from desktop. |
| Text (T) | T | Click to place text label. |
| Draw (D) | ✏ | Freehand drawing tool. Creates sketch strokes on canvas. |
| Note (N) | 📋 | Click to place sticky note. |
| Color (C) | 🎨 | Click to place color swatch (opens color picker). |
| Arrow (A) | → | Draw connections between shapes. Creates reference links. |

**Assets Panel** (togglable, below toolbar):
- **Recent Images**: Thumbnails from gallery, newest first
- **Search**: Filter by prompt text
- **Drag to Canvas**: Drag any thumbnail onto the canvas to place it as an AIImage shape
- **Upload Zone**: Drag files here to upload to Stow first, then place on canvas
- Powered by existing `gallery.list` infinite query

### Right Panel — Properties Inspector

Content changes based on selection:

**Nothing selected → Board Overview:**
- Board name (editable)
- Image count on board
- Total generation cost for this board
- Created / last modified dates
- Export board as image button

**AIImage selected → Image Properties:**
```
┌─────────────────────────┐
│ [Image Thumbnail]        │
│                          │
│ Prompt                   │
│ "A red fox in a..."      │
│ [Copy]                   │
│                          │
│ Model      Banana Pro    │
│ Aspect     16:9          │
│ Resolution 2K            │
│ Cost       $0.15         │
│ Created    2 min ago     │
│                          │
│ ─── Actions ──────────── │
│ [Vary]  [Upscale]        │
│ [Remove BG]  [Download]  │
│                          │
│ ─── Connections ──────── │
│ Referenced by: img_3     │
│ Derived from: img_1      │
└─────────────────────────┘
```

**GenerationFrame selected → Generation Controls:**
```
┌─────────────────────────┐
│ Generation Frame         │
│                          │
│ Prompt                   │
│ ┌──────────────────────┐ │
│ │ "A red fox sitting..."│ │
│ └──────────────────────┘ │
│                          │
│ Model                    │
│ [GPT] [Banana] [Gem.F]   │
│ [Gemini 3 Pro]           │
│                          │
│ Aspect     16:9          │
│ Resolution [1K][2K][4K]  │
│ Count      [1][2][3][4]  │
│ BG         [Clear]       │
│                          │
│ References (3)           │
│ [img_1] [img_2] [img_5]  │
│ (from arrow connections)  │
│                          │
│ [$0.15]  [✦ Generate]    │
└─────────────────────────┘
```

**Arrow selected → Connection Info:**
- Source image name/thumb
- Target (image or generation frame)
- Type: Reference link
- Delete connection button

**Multiple shapes selected → Bulk Actions:**
- [Generate from Selection] — Creates new GenerationFrame with all selected images as references
- [Group] — Group into a tldraw group
- [Align] — Alignment tools
- [Export Selection] — Export selected area as image

---

## Custom Shapes

### 1. AIImage Shape

The primary shape. Represents any image on the canvas — generated, uploaded, or processed.

```typescript
interface AIImageShape extends TLBaseShape<'ai-image', {
  // Image data
  stowKey: string          // Key in Stow/R2
  imageUrl: string         // CDN URL for display
  w: number                // Display width on canvas
  h: number                // Display height on canvas
  naturalWidth: number     // Original pixel width
  naturalHeight: number    // Original pixel height

  // Metadata
  prompt: string | null
  model: string | null
  aspect: string | null
  resolution: string | null
  cost: number | null
  type: 'generated' | 'uploaded' | 'variation' | 'upscale' | 'rmbg' | 'composite'
  createdAt: string

  // Lineage
  parentImageIds: string[] // IDs of parent AIImage shapes (for composite tracking)
  jobId: string | null     // Reference to generation job

  // Display
  opacity: number          // 0-1
  borderRadius: number     // Corner rounding
}> {}
```

**Rendering:**
- Displays the image at specified dimensions
- On hover: subtle border glow + shape name tooltip
- When selected: standard tldraw selection handles for resize
- Badge in corner showing model icon (small, subtle)

**Interactions:**
- Double-click: Opens image in lightbox overlay (existing component, adapted)
- Right-click context menu: Vary, Upscale, Remove BG, Download, Copy Prompt, Delete
- Drag from edge: Start drawing an arrow (connection)

### 2. GenerationFrame Shape

A placeholder that becomes an image after generation. The canvas equivalent of the generate form.

```typescript
interface GenerationFrameShape extends TLBaseShape<'generation-frame', {
  w: number
  h: number

  // Generation settings
  prompt: string
  model: string
  aspect: string
  resolution: string | null
  count: number
  transparent: boolean
  inputFidelity: 'default' | 'low'

  // State
  status: 'draft' | 'queued' | 'processing' | 'completed' | 'failed'
  jobId: string | null
  queuePosition: number | null
  elapsedTime: number | null
  error: string | null

  // Connected references (populated from incoming arrows)
  // Not stored here — computed from tldraw bindings at generation time
}> {}
```

**Rendering (by status):**
- `draft`: Dashed border rectangle with prompt text centered, faint ✦ icon. Aspect ratio matches selected ratio.
- `queued`: Pulsing border, queue position number displayed large
- `processing`: Animated gradient sweep, elapsed time counter
- `completed`: Transforms into AIImage shape(s). Frame dissolves.
- `failed`: Red border, error message, retry button

**Interactions:**
- Click to select → Right panel shows generation controls
- Cmd+Enter while selected → Trigger generation
- Arrows pointing INTO this frame = reference images for the generation

### 3. SketchRegion Shape

A region of freehand drawing that can be rasterized and used as a generation reference.

```typescript
interface SketchRegionShape extends TLBaseShape<'sketch-region', {
  w: number
  h: number
  // Contains grouped tldraw draw strokes
  // On "Use as reference", rasterizes the region to an image
}> {}
```

**Workflow:**
1. Switch to Draw tool → sketch on canvas
2. Select the sketch strokes → right-click → "Create Sketch Region"
3. Groups strokes into a SketchRegion with a bounding box
4. Draw an arrow from SketchRegion → GenerationFrame
5. At generation time, the sketch is rasterized via tldraw's `toImage()` and uploaded as a reference

### 4. StickyNote Shape

```typescript
interface StickyNoteShape extends TLBaseShape<'sticky-note', {
  w: number
  h: number
  text: string
  color: 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'gray'
}> {}
```

Simple text annotations for moodboard context. Standard sticky note UX.

### 5. ColorSwatch Shape

```typescript
interface ColorSwatchShape extends TLBaseShape<'color-swatch', {
  color: string    // Hex color
  label: string    // Optional name ("Brand Blue")
  size: number     // Circle diameter
}> {}
```

A small circle displaying a color. Click to edit with color picker. Useful for palette exploration alongside generated images.

---

## Core Workflows

### Workflow 1: Basic Generation (Canvas-Native)

```
1. User selects Generate tool (G)
2. Draws rectangle on canvas
   → GenerationFrame shape created at that position/size
   → Aspect ratio auto-detected from drawn proportions
   → Right panel opens with generation controls
3. User types prompt in right panel
4. Selects model, adjusts settings
5. Clicks [Generate] or Cmd+Enter
6. Frame shows queue position → processing animation → elapsed time
7. On completion:
   - If count=1: Frame morphs into AIImage shape
   - If count>1: Frame is replaced by N AIImage shapes arranged in a row
8. Gallery sidebar refreshes (new images appear)
```

### Workflow 2: Composite Generation (Select + Action)

```
1. User has images A, B, C on canvas
2. Shift-clicks to select A and B
3. Right panel shows "Multiple Selected" with [Generate from Selection] button
4. User clicks [Generate from Selection]
5. New GenerationFrame appears near the selection
   → Auto-connected with arrows from A and B
   → A and B are pre-filled as reference images
6. User writes composite prompt: "Combine these into a surreal landscape"
7. Generates → result appears as new AIImage, linked to parents
```

### Workflow 3: Composite Generation (Arrow-Based)

```
1. User has images A and B on canvas
2. Selects Arrow tool (A) or drags from image edge
3. Draws arrow from A → empty space on canvas
4. GenerationFrame auto-created at arrow endpoint
5. Draws another arrow from B → same GenerationFrame
6. GenerationFrame now shows 2 reference images (A, B)
7. User adds prompt, generates
8. Result replaces frame, connected via lineage to A and B
```

### Workflow 4: Style Transfer Chain

```
1. User uploads a "style reference" image onto canvas
2. Creates multiple GenerationFrames nearby
3. Draws arrows from the style reference → each frame
4. Each frame now has the style image as a reference
5. User writes different prompts for each frame but all share the style
6. Generates all → consistent style across different subjects
```

### Workflow 5: Sketch-to-Image

```
1. User selects Draw tool (D)
2. Sketches a rough composition on canvas
3. Selects the drawn strokes
4. Right-click → "Create Sketch Region" (or toolbar button)
5. Strokes grouped into a SketchRegion with bounding box
6. User draws arrow from SketchRegion → new GenerationFrame
7. Writes prompt describing what the sketch should become
8. Generates → sketch is rasterized, uploaded as reference, generation runs
9. Result appears as AIImage on canvas
```

### Workflow 6: Iterative Refinement

```
1. User generates image A
2. Right-click A → "Vary"
3. New GenerationFrame appears next to A, pre-connected
4. A's prompt pre-filled, user tweaks it
5. Generates variation → new image B appears
6. User selects B → right panel → [Upscale]
7. Upscaled version C appears linked to B
8. Visual lineage: A → B → C visible on canvas
```

### Workflow 7: Moodboard Assembly + Export

```
1. User creates a board "Summer Campaign"
2. Drags reference images from Assets panel
3. Generates new images with various prompts
4. Adds sticky notes: "Hero image", "Social media set", "Email banner"
5. Drops color swatches for brand palette
6. Arranges everything spatially
7. Selects a region → [Export Selection]
8. Downloads high-res composite image of the moodboard area
```

---

## Board Persistence

### New Database Schema

```sql
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Board',
  tldraw_document JSONB NOT NULL,  -- Full tldraw serialized state
  thumbnail_url TEXT,               -- Auto-generated preview
  image_count INTEGER DEFAULT 0,
  total_cost NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for listing boards
CREATE INDEX idx_boards_updated_at ON boards(updated_at DESC);
```

### New tRPC Router: `board`

```typescript
board.list()
  → { boards: [{ id, name, thumbnailUrl, imageCount, updatedAt }] }

board.get(boardId)
  → { id, name, tldrawDocument, imageCount, totalCost, createdAt, updatedAt }

board.create(name?)
  → { id, name }

board.save(boardId, tldrawDocument, name?)
  → { updatedAt }
  // Called on debounced auto-save (every 2-3 seconds after changes)

board.delete(boardId)
  → { success: boolean }

board.duplicate(boardId, name?)
  → { id, name }
```

### Auto-Save Strategy

- tldraw emits change events via `editor.store.listen()`
- Debounce: 5 seconds after last significant change (shape create/delete, not continuous moves)
- Track update source — ignore ephemeral polling updates (generation status, queue position)
- Save full `editor.store.getSnapshot()` to DB with optimistic locking (`WHERE updated_at = ?`)
- Show subtle "Saving..." / "Saved" indicator in top bar
- On page load: restore from `board.get()` → `editor.store.loadSnapshot()`
- On load, scan for stale GenerationFrames and reconcile with `generate.status`

---

## Asset Panel Integration

The left-side assets panel bridges the gallery with the canvas:

```
┌─────────────────────┐
│ ASSETS              │
│ ┌─────────────────┐ │
│ │ 🔍 Search...    │ │
│ └─────────────────┘ │
│                     │
│ Recent              │
│ ┌────┐ ┌────┐      │
│ │    │ │    │      │
│ └────┘ └────┘      │
│ ┌────┐ ┌────┐      │
│ │    │ │    │      │
│ └────┘ └────┘      │
│ ... (infinite scroll)│
│                     │
│ On This Board       │
│ ┌────┐ ┌────┐      │
│ │    │ │    │      │
│ └────┘ └────┘      │
│                     │
│ ┌─────────────────┐ │
│ │ + Upload Image  │ │
│ └─────────────────┘ │
└─────────────────────┘
```

- **Recent**: From `gallery.list` query (all images across all boards)
- **On This Board**: Filtered to images present on current canvas
- **Search**: Filters by prompt text match
- **Drag to Canvas**: Dragging a thumbnail creates an AIImage shape at drop position
- **Upload**: Standard file picker → upload to Stow → create AIImage shape

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| H | Hand tool |
| G | Generate tool |
| U | Upload tool |
| T | Text tool |
| D | Draw tool |
| N | Note tool |
| C | Color swatch tool |
| A | Arrow tool |
| Space+drag | Pan (any tool) |
| Cmd+Enter | Generate (when GenerationFrame selected) |
| Delete/Backspace | Delete selected |
| Cmd+Z / Cmd+Shift+Z | Undo / Redo |
| Cmd+D | Duplicate selected |
| Cmd+G | Group selected |
| Cmd+E | Export selected as image |
| Cmd++ / Cmd+- | Zoom in / out |
| Cmd+0 | Zoom to fit |
| Cmd+1 | Zoom to 100% |
| Esc | Deselect / close panel |
| [ / ] | Bring forward / send backward |

---

## Generation Status on Canvas

When a GenerationFrame is generating, it displays status directly on the shape:

```
┌─────────────────────────────┐
│                             │
│         ◇ 3                 │  ← Queue position (large)
│     In queue...             │
│                             │
└─────────────────────────────┘

┌─────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░  │  ← Animated gradient sweep
│                             │
│        0:14                 │  ← Elapsed time
│     Generating...           │
│                             │
│  "Sampling step 8/20"       │  ← Latest log line
└─────────────────────────────┘

┌─────────────────────────────┐
│                             │
│         ✓                   │
│       DONE                  │  ← Brief flash before morphing to image
│                             │
└─────────────────────────────┘
```

Multiple concurrent generations supported — each frame tracks its own job independently.

---

## Export Capabilities

### Export Selection
- Select shapes on canvas → Cmd+E or right-click → Export
- Uses tldraw's `editor.toImage()` with bounding box of selection
- Options: scale (1x, 2x, 4x), format (PNG, JPEG), include background
- Downloads to local filesystem

### Export Board
- Top bar or board properties → Export Board
- Exports visible canvas area or all content
- Same options as above

### Share Board (future)
- Generate a shareable link with read-only view
- Would require additional infrastructure

---

## Technical Considerations

### Key Design Decisions (from review)

**1. Source of Truth: DB over tldraw shapes**
AIImage shapes store `stowKey` + `imageUrl` only. Full metadata (prompt, model, cost) lives in the `images` table and is fetched on demand by the properties panel. Prevents sync drift between two parallel data stores.

**2. GenerationFrame → AIImage Morphing**
Use `editor.batch()` to atomically delete frame + create AIImage shapes + rebind arrows. If batch fails, frame stays — user retries. DB already has images as fallback. This avoids the two-phase commit problem where a frame is deleted but images fail to create.

**3. tldraw ↔ tRPC State Sync**
Track update source with a ref/flag. Auto-save ignores polling-sourced shape updates (status/queue position are ephemeral — don't need persistence). Only persist user-driven changes (move, resize, create, delete). This prevents infinite loops where `editor.updateShape()` triggers `store.listen()` triggers save.

**4. Arrow Semantics**
Arrows terminating at a GenerationFrame become reference links (visual: dashed purple). Regular arrows remain for annotation. Only reference arrows feed into generation. This avoids semantic overloading where decorative arrows accidentally trigger generative behavior.

**5. Concurrent Generation Polling**
Create `generate.statusBatch` endpoint accepting multiple jobIds. Single request fans out results client-side. Prevents 10+ req/s at scale when multiple frames are generating simultaneously.

**6. Board Auto-Save**
Debounce to 5s (not 2s). Save only on significant changes (shape create/delete, not continuous moves/resizes). Add `WHERE updated_at = ?` for optimistic locking (multi-tab safety). This balances responsiveness with DB write volume.

**7. Stale Generation Recovery**
On board load, scan for GenerationFrames with active statuses (`queued`, `processing`). Check `generate.status` for each. Auto-morph if completed, show error state if failed. Handles the case where user closes tab mid-generation.

### Open Questions (Address During Implementation)

- **Board document size at scale**: Benchmark JSONB read/write with 200+ shape boards. Consider gzip compression.
- **tldraw version pinning**: Pin to exact version. Document migration strategy for snapshot format changes.
- **Shape schema versioning**: Add `{ version: 1 }` to board document for future migrations.
- **Empty canvas onboarding**: Design the first-use experience (centered prompt + quick-action).
- **SketchRegion rasterization timing**: Rasterize at generation submit time, upload via presigned URL flow.
- **Mixed selection in properties panel**: Show "Multiple Selected" with intersection of available actions.
- **Asset panel drag coordinates**: Use `editor.screenToPage()` to convert drop position from viewport to canvas coords.
- **Undo/redo across save boundaries**: Accept that undo history is session-only (standard for canvas tools).
- **Accidental frame deletion**: Consider confirmation dialog when deleting a GenerationFrame that has an active job.

### tldraw Integration
- Use `@tldraw/tldraw` React component as canvas
- Register custom shapes via `shapeUtils` prop
- Register custom tools via `tools` prop
- Override UI components for toolbar and properties panel
- Use `editor.store.listen()` for persistence
- Use `editor.store.getSnapshot()` / `loadSnapshot()` for save/restore

### Performance
- tldraw handles virtualization — only visible shapes render
- Images loaded lazily via Stow CDN URLs
- Thumbnail versions for small display sizes (Stow supports transforms)
- Board document JSON could get large — consider compression for storage
- Auto-save debounced to 5s to prevent excessive DB writes
- Benchmark: target <500 shapes per board for smooth performance

### Migration from Current UI
- Gallery page preserved as-is
- Main page becomes the canvas (default board or board list)
- All existing tRPC routers preserved
- New `board` router added
- generate-form logic extracted into right panel component
- Image grid / lightbox components adapted for canvas context

### Dependencies to Add
- `tldraw` (or `@tldraw/tldraw`) — the canvas SDK
- Potentially `zustand` if tldraw doesn't cover all state needs (it likely does — tldraw uses its own store)

---

## Implementation Phases

### Phase 1: Canvas Foundation
- tldraw integration in Next.js
- AIImage custom shape (display image, show metadata on select)
- Properties panel (right side, contextual)
- Basic toolbar (Select, Hand, Upload)
- Drop images onto canvas from filesystem
- Board CRUD + persistence (auto-save)
- Board switcher in top bar

### Phase 2: Canvas-Native Generation
- GenerationFrame custom shape
- Generate tool (draw frame → configure → generate)
- Generation status display on frame shapes
- Frame → AIImage morphing on completion
- Connect existing tRPC generate router to canvas workflow
- Cmd+Enter to generate selected frame

### Phase 3: Compositing & Connections
- Arrow connections between shapes
- CompositeNode behavior (collect references from arrows)
- "Generate from Selection" bulk action
- Reference images auto-populated from connections
- Lineage tracking (parentImageIds)

### Phase 4: Creative Tools
- StickyNote shape
- ColorSwatch shape
- SketchRegion shape + sketch-to-image workflow
- Draw tool integration with generation references

### Phase 5: Asset Panel & Gallery Integration
- Left panel asset browser
- Drag from assets to canvas
- Search/filter in assets
- "On This Board" filter
- Gallery page preserved with link to canvas

### Phase 6: Polish & Advanced Features
- Export selection / board as image
- Board thumbnails (auto-generated)
- Image lightbox on canvas (double-click)
- Processing actions on canvas (upscale, rmbg)
- Undo/redo integration with tldraw
- Keyboard shortcuts
- Responsive / mobile considerations
