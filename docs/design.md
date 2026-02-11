# Falcon Web UI — Design Specification

## Personality: Quiet Professional
Like Linear or Raycast. Restrained, precise, typographically tight. The tool gets out of the way. The images are the star.

## Layout: Sidebar + Canvas + History

Three-column layout:
- **Left panel** (280px fixed): Controls — prompt, model, aspect, resolution, presets, reference images, generate button
- **Center canvas** (flex-grow): Generated images fill this space. Empty state when no results yet.
- **Right panel** (256px, collapsible): History feed — recent generations as small thumbnails with prompt snippets

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#09090b` | Page background |
| `surface` | `#18181b` | Sidebar/panel backgrounds |
| `surface-2` | `#27272a` | Elevated elements, inputs |
| `border` | `#27272a` | Default borders |
| `border-subtle` | `#1e1e22` | Subtle dividers |
| `text` | `#fafafa` | Primary text |
| `text-secondary` | `#a1a1aa` | Secondary text |
| `text-tertiary` | `#52525b` | Hint text, disabled |
| `accent` | `#8b5cf6` | Primary accent (violet) |
| `accent-hover` | `#a78bfa` | Hover state |
| `accent-muted` | `rgba(139, 92, 246, 0.1)` | Subtle accent backgrounds |

## Typography

- **Font**: Geist Sans (bundled with Next.js 15)
- **Mono**: Geist Mono (for costs, metadata)
- Nav title: 15px medium, tracking-tight
- Section labels: 11px medium, text-tertiary, tracking-wide
- Controls: 13px normal
- Metadata: 12px mono, text-secondary

## Component Patterns

### Controls (sidebar)
- Chips use background color difference, not heavy borders
- Selected state: accent-muted bg + accent text
- Unselected: surface-2 bg, text-secondary, no border
- Hover: slight brightness increase
- No ALL CAPS labels — sentence case, text-tertiary

### Generate button
- Full sidebar width, violet background, white text
- Only high-emphasis element on the page
- Shows cost in mono font

### Canvas area
- Empty state: centered muted message
- Loading: skeleton pulse matching aspect ratio
- Results: image fills available space with action bar below
- Action bar: Download, Upscale, Remove BG, Vary — small muted buttons

### History sidebar
- Vertical feed of small thumbnails (48x48)
- Prompt snippet (truncated), model badge, aspect
- Active/selected item has accent-muted left border
- Click loads into canvas
- Scrolls independently

### Gallery page
- Full-width (no sidebar layout)
- 5-column grid (responsive: 2 → 3 → 4 → 5)
- Square thumbnails with hover overlay
- Same lightbox component
