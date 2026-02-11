# Design Direction: Falcon — Editorial Refinement

## Aesthetic Direction
- **Tone:** Editorial — magazine-like typographic control, hierarchy through weight and scale
- **Memorable element:** Spatial composition — asymmetric breathing room, density contrast between panels, upper-third placement
- **Personality:** Plain/Simple with editorial precision — every element earns its space
- **Palette:** Cool zinc monochrome, light mode, no color accent

## Typography
- **Display/Body:** Geist Sans — used at dramatically different scales for hierarchy
- **Mono:** Geist Mono — costs, metadata, timestamps
- **Section labels:** 10px, uppercase, tracking-widest, text-tertiary — editorial structure markers
- **Prompt textarea:** Prominent, 14px body, generous padding

## Color Palette (zinc, light, cool)

| Role | Value | Usage |
|------|-------|-------|
| bg | #fafafa | Page background |
| surface | #f4f4f5 | Sidebar, panels (zinc-100) |
| surface-2 | #e4e4e7 | Selected chips, inputs, interactive (zinc-200) |
| border | #d4d4d8 | Borders (zinc-300) |
| border-subtle | #e4e4e7 | Subtle dividers (zinc-200) |
| text | #09090b | Primary text (zinc-950) |
| text-secondary | #3f3f46 | Secondary text (zinc-700) |
| text-tertiary | #a1a1aa | Labels, hints (zinc-400) |
| accent | #18181b | Buttons, strong emphasis (zinc-900) |
| accent-hover | #27272a | Hover states (zinc-800) |
| accent-muted | #e4e4e7 | Selected chip backgrounds (zinc-200) |

Key fix: `accent-muted` is now zinc-200 (#e4e4e7), distinct from `surface` (zinc-100 #f4f4f5).

## Spacing
- Base unit: 4px
- Sidebar section gaps: 24px between groups
- Sidebar internal padding: 16px
- Canvas padding: 24px
- History rows: 8px vertical gap (tight, editorial contrast)

## Depth Strategy
- **Borders only** — no shadows on panels
- Ring shadows on inputs/selected chips for subtle lift: `ring-1 ring-border`
- Clean hairline dividers between panels

## Motion
- Image appear: fade-in 200ms ease-out
- Hover states: 100ms background-color transitions
- No springs, no bounces — editorial precision

## Layout

### Desktop — Generate Page
- 3-column: Left sidebar (280px) + Center canvas (flex) + Right history (240px)
- Empty state text at upper third, not dead center
- Keyboard shortcut hint sits alone, muted, below the empty state text
- Image actions as inline text buttons below image (not floating overlays)

### Desktop — Gallery
- Full-width, own nav, 5-column responsive grid
- Clean, generous padding

## Change Spec

### Typography
| Element | Before | After |
|---------|--------|-------|
| Section labels (Model, Aspect, etc.) | text-[11px] font-medium text-text-tertiary | text-[10px] font-medium uppercase tracking-widest text-text-tertiary |
| text-secondary | #52525b (zinc-600) | #3f3f46 (zinc-700) — stronger readability |

### Colors
| Element | Before | After |
|---------|--------|-------|
| accent-muted | #f4f4f5 (invisible on surface) | #e4e4e7 (zinc-200, visible) |
| text-secondary | #52525b (zinc-600) | #3f3f46 (zinc-700) |

### Spatial Composition
| Element | Before | After |
|---------|--------|-------|
| Empty state canvas | Centered vertically | Upper third (items-start pt-[25vh]) |
| Canvas image actions | Hover overlay on image | Inline text row below image |
| Sidebar section spacing | Implicit | Explicit 24px gaps between groups |
| History sidebar width | 256px | 240px (slightly tighter) |

### Interactive States
| Element | Before | After |
|---------|--------|-------|
| Selected chips | bg-accent-muted (invisible) | bg-surface-2 text-text font-medium |
| Unselected chips | bg-surface-2 text-text-secondary | bg-transparent text-text-secondary hover:bg-surface-2 |
| Generate button | bg-accent text-white | bg-accent text-white (same, works) |
| Textarea | bg-surface-2 border-none | bg-white ring-1 ring-border focus:ring-accent |

## Anti-Patterns to Avoid
- No color accents beyond zinc
- No shadows on panels (borders only depth strategy)
- No floating/overlay actions on images in the main canvas
- No centered empty states (always upper third)
- No decorative elements that don't convey information
