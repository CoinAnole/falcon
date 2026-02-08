<p align="center">
  <img src="https://raw.githubusercontent.com/howells/falcon/main/logo.png" width="128" alt="Falcon">
</p>
<h1 align="center">Falcon</h1>

<p align="center">
  CLI for generating images with <a href="https://fal.ai">fal.ai</a><br>
  <code>brew install howells/tap/falcon</code>
</p>

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

**Homebrew**
```bash
brew install howells/tap/falcon
```

**bunx** (requires [Bun](https://bun.sh))
```bash
bunx @howells/falcon "your prompt"
```

**Manual**
```bash
git clone https://github.com/howells/falcon.git
cd falcon && bun install && bun link
```

## Models

| Model | Description | Price |
|-------|-------------|-------|
| `banana` | Nano Banana Pro (default) | $0.15-0.30 |
| `gpt` | GPT Image 1.5, supports transparency | $0.01-0.20 |
| `gemini` | Gemini 2.5 Flash, fast | $0.04 |
| `gemini3` | Gemini 3 Pro, highest quality | $0.15-0.30 |
| `flux2` | Flux 2 | $0.04-0.06 |
| `flux2Flash` | Flux 2 Flash | $0.015-0.025 |
| `flux2Turbo` | Flux 2 Turbo | $0.03-0.05 |
| `imagine` | Grok Imagine | $0.04 |

## Options

```
falcon [prompt] [options]

-m, --model <model>      Model: gpt, banana, gemini, gemini3, flux2, flux2Flash, flux2Turbo, imagine
-e, --edit <file>        Edit an existing image with prompt
-a, --aspect <ratio>     Aspect ratio (model-specific)
-r, --resolution <res>   Resolution: 1K, 2K, 4K
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
