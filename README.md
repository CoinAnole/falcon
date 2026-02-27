<p align="center">
  <img src="https://raw.githubusercontent.com/coinanole/falcon/main/logo.png" width="128" alt="Falcon">
</p>
<h1 align="center">Falcon</h1>

<p align="center">
  CLI for generating images with <a href="https://fal.ai">fal.ai</a>
</p>

<p align="center">
  <em>A fork of <a href="https://github.com/howells/falcon">howells/falcon</a>. Originally created by Daniel Howells.</em>
</p>

## What Changed In This Fork

Since forking from `6ff02bf42409a9995927e41b9d720f0bd8763690`, this fork has focused on broader model support, stronger reliability, and much deeper test coverage:

- Added major model support and model-specific behavior: Flux 2 (`flux2`, `flux2Flash`, `flux2Turbo`), Grok Imagine (`imagine`), extra aspect ratios, and output format control (`--format`) for supported models.
- Added live pricing integration (`src/api/pricing.ts`) with 6-hour cache, `falcon pricing --refresh`, and cost metadata used across CLI/Studio history tracking.
- Added reproducibility and advanced generation controls, including `--seed` plus Flux-specific flags (`--guidance-scale`, `--prompt-expansion`, `--inference-steps`, `--acceleration`).
- Hardened CLI and file handling with stricter validation (model-specific aspect checks, bounds checks, output path normalization/indexing, safer path constraints) and improved API error handling/timeouts.
- Added an OS-temp debug logging system (`FALCON_DEBUG`, `FALCON_LOG_LEVEL`) with API key redaction and broader logging coverage across CLI, Studio, and API layers.
- Added a comprehensive Bun test suite from scratch (API, CLI, utilities, and Studio/Ink UI), including property-based tests and flaky-test detector scripts.

## Quick Start

```bash
# Set your API key (get one at fal.ai/dashboard/keys)
export FAL_KEY="your-api-key"

# Generate an image
falcon "a cat on a windowsill at sunset"

# Use presets
falcon "mountain vista" --landscape -r 4K
falcon "app icon" --square -m gpt --transparent

# Post-process
falcon --up          # Upscale last image
falcon --rmbg        # Remove background
falcon --vary -n 4   # Generate variations
```

## Install

**Manual**
```bash
git clone https://github.com/coinanole/falcon.git
cd falcon && bun install && bun link
```

## Models

| Model | Description | Price |
|-------|-------------|-------|
| `banana` | Nano Banana Pro (default) | $0.15/image |
| `gpt` | GPT Image 1.5, supports transparency | $1.00/unit (~$0.21/call) |
| `gemini` | Gemini 2.5 Flash, fast | $0.0398/image |
| `gemini3` | Gemini 3 Pro, highest quality | $0.15/image |
| `flux2` | Flux 2 | $0.012/megapixel |
| `flux2Flash` | Flux 2 Flash | $0.005/megapixel |
| `flux2Turbo` | Flux 2 Turbo | $0.008/megapixel |
| `imagine` | Grok Imagine | $0.02/image |

Prices can vary by account and are subject to change. Use `falcon pricing --refresh` to update cached live pricing.

## Options

```
falcon [prompt|prompt.json] [options]

-m, --model <model>      Model: gpt, banana, gemini, gemini3, flux2, flux2Flash, flux2Turbo, imagine
-e, --edit <files>       Edit existing image(s) with prompt (comma-separated)
-a, --aspect <ratio>     Aspect ratio (model-specific)
-r, --resolution <res>   Resolution: 1K, 2K, 4K, 512x512 (Flux 2 only)
-o, --output <file>      Output filename
-n, --num <count>        Number of images (1-4)
-f, --format <format>    Output format: jpeg, png, webp (Grok, Flux, Gemini 3 Pro)
--transparent            Transparent background PNG (GPT only)
--no-open                Don't open after generation

--last                   Show last generation info
--vary                   Generate variations of last image
--up                     Upscale last image
--rmbg                   Remove background from last image
--scale <factor>         Upscale factor: 2, 4, 6, 8 (with --up)

Flux 2 options:
--guidance-scale <n>     Guidance scale 0-20 (default: 2.5)
--prompt-expansion       Enable prompt expansion for better results
--inference-steps <n>    Base Flux 2 only: steps 4-50 (default: 28)
--acceleration <level>   Base Flux 2 only: none, regular, high (default: regular)
```

Positional `[prompt]` can also be a path ending in `.json`; Falcon reads the file as plain text prompt content (no JSON parsing).

Example multi-image edit:
```bash
falcon "blend these references into one scene" --model banana --edit ref-a.png,ref-b.png
falcon prompts/launch.json --model gemini3
```

Note: `imagine` edit supports exactly one source image.

## Presets

| Preset | Aspect | Use |
|--------|--------|-----|
| `--cover` | 2:3, 2K | Kindle/eBook covers |
| `--square` | 1:1 | Profile pictures, icons |
| `--landscape` | 16:9 | Desktop wallpapers |
| `--portrait` | 2:3 | Phone wallpapers |
| `--story` | 9:16 | Instagram/TikTok stories |
| `--reel` | 9:16 | Instagram Reels |
| `--feed` | 4:5 | Instagram feed |
| `--og` | 16:9 | Social share images |
| `--wallpaper` | 9:16, 2K | Phone wallpapers |
| `--wide` | 21:9 | Cinematic |
| `--ultra` | 21:9, 2K | Ultra-wide banner |

## Config

```bash
# Environment variable
export FAL_KEY="your-api-key"

# Or ~/.falcon/config.json
{
  "apiKey": "your-api-key",
  "defaultModel": "banana",
  "defaultAspect": "1:1",
  "defaultResolution": "2K"
}
```

Per-project config: `.falconrc`

## Interactive Mode

```bash
falcon  # Launch terminal UI
```

---

MIT · [fal.ai](https://fal.ai)
