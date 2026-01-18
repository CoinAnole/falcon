<p align="center">
  <img src="logo.svg" width="64" height="64" alt="Falky">
</p>

<h1 align="center">Falky</h1>

<p align="center">
  CLI for generating images with <a href="https://fal.ai">fal.ai</a>
</p>

---

Supports multiple models, batch generation, upscaling, and background removal.

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/howells/falky/main/install.sh | bash
```

### Manual Install

Requires [Bun](https://bun.sh) runtime.

```bash
git clone https://github.com/howells/falky.git
cd falky
bun install
bun link
```

## Configuration

Set your fal.ai API key:

```bash
export FAL_KEY="your-api-key"
```

Or add it to `~/.falky/config.json`:

```json
{
  "apiKey": "your-api-key"
}
```

Get your API key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

### Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | - | Your fal.ai API key |
| `defaultModel` | `banana` | Default generation model |
| `defaultAspect` | `1:1` | Default aspect ratio |
| `defaultResolution` | `2K` | Default resolution |
| `openAfterGenerate` | `true` | Auto-open images after generation |
| `upscaler` | `clarity` | Upscaler model (`clarity` or `crystal`) |
| `backgroundRemover` | `rmbg` | Background removal model (`rmbg` or `bria`) |

You can also create a `.falkyrc` file in any directory to override settings per-project.

## Usage

### Generate Images

```bash
# Basic generation
falky "a cat sitting on a windowsill at sunset"

# Specify model
falky "cyberpunk cityscape" -m banana

# Set aspect ratio and resolution
falky "mountain landscape" -a 16:9 -r 4K

# Generate multiple images
falky "abstract art" -n 4

# Use presets
falky "book cover design" --cover      # 9:16, 2K
falky "profile picture" --square       # 1:1
falky "desktop wallpaper" --landscape  # 16:9
falky "phone wallpaper" --portrait     # 2:3
```

### Edit Images

```bash
# Edit an existing image with a prompt
falky "add a rainbow in the sky" -e ./photo.png
```

### Post-Processing

```bash
# Show last generation info
falky --last

# Generate variations of last image
falky --vary
falky --vary -n 4  # 4 variations

# Upscale last image
falky --up
falky --up --scale 4  # 4x upscale

# Remove background from last image
falky --rmbg
```

### Interactive Studio

Run `falky` without arguments to launch the interactive terminal UI:

```bash
falky
```

## Models

### Generation Models

All models support image editing with the `-e` flag.

| Model | Name | Pricing | Features |
|-------|------|---------|----------|
| `banana` | Nano Banana Pro | $0.15-$0.30/image | Aspect, resolution (default) |
| `gpt` | GPT Image 1.5 | $0.01-$0.20/image | Variable quality settings |
| `gemini` | Gemini 2.5 Flash | $0.039/image | Fast, affordable |
| `gemini3` | Gemini 3 Pro | $0.15-$0.30/image | Highest quality |

### Utility Models

| Model | Name | Use |
|-------|------|-----|
| `clarity` | Clarity Upscaler | Default upscaler |
| `crystal` | Crystal Upscaler | Alternative upscaler |
| `rmbg` | BiRefNet | Background removal |
| `bria` | Bria RMBG 2.0 | Background removal |

## Options Reference

```
Usage: falky [prompt] [options]

Options:
  -m, --model <model>      Model: gpt, banana, gemini, gemini3
  -e, --edit <file>        Edit an existing image
  -a, --aspect <ratio>     Aspect ratio (see below)
  -r, --resolution <res>   Resolution: 1K, 2K, 4K
  -o, --output <file>      Output filename
  -n, --num <count>        Number of images (1-4)
  --no-open                Don't auto-open after generation

Presets:
  --cover                  Book cover: 9:16, 2K
  --square                 Square: 1:1
  --landscape              Landscape: 16:9
  --portrait               Portrait: 2:3

Post-processing:
  --last                   Show last generation info
  --vary                   Generate variations of last image
  --up                     Upscale last image
  --rmbg                   Remove background from last image
  --scale <factor>         Upscale factor (with --up)
```

### Aspect Ratios

`21:9` | `16:9` | `3:2` | `4:3` | `5:4` | `1:1` | `4:5` | `3:4` | `2:3` | `9:16`

## Cost Tracking

Falky tracks your spending automatically:

```
Session: $0.52 | Today: $1.24
```

View your history in `~/.falky/history.json`.

## License

MIT
