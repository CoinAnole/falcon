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

## Options

```
falcon [prompt] [options]

-m, --model <model>    Model: banana, gpt, gemini, gemini3
-a, --aspect <ratio>   21:9, 16:9, 3:2, 4:3, 1:1, 4:5, 2:3, 9:16
-r, --resolution       1K, 2K, 4K
-e, --edit <file>      Edit existing image with prompt
-n, --num <count>      Generate 1-4 images
-o, --output <file>    Output filename
--transparent          Transparent PNG (gpt only)
--no-open              Don't open after generation

--last                 Show last generation
--vary                 Variations of last image
--up [--scale 2-8]     Upscale last image
--rmbg                 Remove background
```

## Presets

| Preset | Aspect | Use |
|--------|--------|-----|
| `--cover` | 2:3, 2K | Kindle/eBook covers |
| `--square` | 1:1 | Profile pictures, icons |
| `--landscape` | 16:9 | Desktop wallpapers |
| `--portrait` | 2:3 | Phone wallpapers |
| `--story` | 9:16 | Instagram/TikTok stories |
| `--feed` | 4:5 | Instagram feed |
| `--og` | 16:9 | Social share images |
| `--wide` | 21:9 | Cinematic |

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
