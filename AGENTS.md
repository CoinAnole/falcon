# Agent Guide for Falcon

This document provides essential information for AI agents working on the Falcon project.

## Project Overview

**Falcon** is a CLI tool for generating images using [fal.ai](https://fal.ai) AI models. It provides both a command-line interface for quick generation and an interactive terminal UI (Studio mode) for a guided experience.

### Key Features
- Generate images from text prompts using multiple AI models (GPT Image 1.5, Gemini, Nano Banana, Flux 2/Flash/Turbo, Grok Imagine)
- Interactive terminal UI with keyboard navigation
- Post-processing: upscaling, background removal, variations
- Aspect ratio presets for common use cases (social media, wallpapers, book covers)
- Generation history with cost tracking
- Configurable defaults via config files

## Architecture

### Tech Stack
- **Runtime**: [Bun](https://bun.sh) (required)
- **Language**: TypeScript
- **UI Framework**: [Ink](https://github.com/vadimdemedes/ink) (React for CLI)
- **CLI Parser**: [Commander.js](https://github.com/tj/commander.js)
- **Linting**: Biome + Ultracite

### Project Structure

```
.
├── bin/falcon           # Entry point (imports src/index.ts)
├── src/
│   ├── index.ts         # Main entry - detects CLI vs Studio mode
│   ├── cli.ts           # Command-line argument parsing & handlers
│   ├── api/
│   │   ├── fal.ts       # Fal.ai API client (generate, upscale, rmbg)
│   │   ├── models.ts    # Model configurations, aspect ratios, static pricing
│   │   └── pricing.ts   # Live pricing client with caching and estimates
│   ├── types/
│   │   └── pricing.ts   # Pricing metadata types
│   ├── studio/
│   │   ├── App.tsx      # Main React app with screen routing
│   │   ├── components/
│   │   │   └── Spinner.tsx
│   │   └── screens/
│   │       ├── Home.tsx      # Main menu
│   │       ├── Generate.tsx  # Generation workflow
│   │       ├── Edit.tsx      # Edit/upscale/rmbg operations
│   │       ├── Gallery.tsx   # Browse history
│   │       └── Settings.tsx  # Configuration UI
│   └── utils/
│       ├── config.ts    # Config & history management
│       └── image.ts     # Image download, resize, open utilities
├── tests/               # Test suite (Bun test runner)
│   ├── api/             # API layer tests
│   ├── cli/             # CLI parsing tests
│   ├── studio/          # Studio UI tests
│   ├── utils/           # Utility tests
│   ├── helpers/         # Test helpers
│   ├── fixtures/        # Test fixtures
│   ├── types/           # Type declarations (ink-testing-library)
│   └── TESTING_GUIDELINES.md
├── docs_for_AIs/        # API documentation for AI models (see Model Documentation section)
├── package.json
├── tsconfig.json
├── biome.json           # Code formatting/linting config
└── install.sh           # Installation script
```

## Key Components

### API Layer (`src/api/`)

#### `fal.ts`
The main API client for fal.ai services:
- [`generate()`](src/api/fal.ts:68) - Generate images from prompts
- [`upscale()`](src/api/fal.ts:137) - Upscale images using Clarity/Crystal
- [`removeBackground()`](src/api/fal.ts:182) - Remove backgrounds
- Handles API key management via [`getApiKey()`](src/api/fal.ts:55)

#### `models.ts`
Central configuration for all supported models:
- **Generation models**: `gpt`, `banana`, `gemini`, `gemini3`, `flux2`, `flux2Flash`, `flux2Turbo`, `imagine`
- **Utility models**: `clarity`, `crystal` (upscalers), `rmbg`, `bria` (background removal)
- Aspect ratios: `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16` (common); Grok adds: `2:1`, `20:9`, `19.5:9`, `9:19.5`, `9:20`, `1:2`
- Resolutions: `1K`, `2K`, `4K`
- [`estimateCost()`](src/api/models.ts:160) - Static cost estimation (fallback)

#### `pricing.ts`
Live pricing client with caching and estimates from fal.ai API:
- [`estimateGenerationCost()`](src/api/pricing.ts:229) - Get live cost estimate for image generation
- [`estimateUpscaleCost()`](src/api/pricing.ts:302) - Get live cost estimate for upscaling
- [`estimateBackgroundRemovalCost()`](src/api/pricing.ts:369) - Get live cost estimate for background removal
- [`refreshPricingCache()`](src/api/pricing.ts:218) - Force refresh pricing cache
- Caches pricing data for 6 hours in `~/.falcon/pricing.json`
- Falls back to static estimates if API is unavailable
- Supports both `unit_price` (per-image) and `historical_api_price` (compute-based) models

### Studio Mode (`src/studio/`)

Interactive terminal UI built with Ink (React for CLI):

#### Screen Flow
1. **Home** - Menu to navigate to other screens
2. **Generate** - Step-by-step generation workflow:
   - Prompt input → Preset selection → Model → Aspect → Resolution → Confirm
3. **Edit** - Post-processing operations on existing images
4. **Gallery** - Browse generation history (paginated)
5. **Settings** - Configure defaults, API key, preferences

#### Navigation
- Arrow keys for navigation
- Enter to select
- Escape to go back
- `q` to quit from home screen

### Configuration (`src/utils/config.ts`)

Configuration is stored in:
- **Global**: `~/.falcon/config.json`
- **Local**: `.falconrc` (project-specific overrides)
- **History**: `~/.falcon/history.json` (last 100 generations)

Default config:
```typescript
{
  defaultModel: "banana",
  defaultAspect: "1:1", 
  defaultResolution: "2K",
  openAfterGenerate: true,
  upscaler: "clarity",
  backgroundRemover: "rmbg"
}
```

### Image Utilities (`src/utils/image.ts`)

- [`downloadImage()`](src/utils/image.ts:8) - Download from URL to file
- [`imageToDataUrl()`](src/utils/image.ts:24) - Convert file to base64 for API upload
- [`resizeImage()`](src/utils/image.ts:44) - Resize using `sips` (macOS)
- [`openImage()`](src/utils/image.ts:126) - Open in system viewer
- [`generateFilename()`](src/utils/image.ts:116) - Timestamp-based naming

## Development Workflow

### Prerequisites
- [Bun](https://bun.sh) must be installed
- fal.ai API key (get at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys))

### Setup
```bash
# Install dependencies
bun install

# Link for local development
bun link
```

### Scripts
```bash
bun run dev          # Run in development mode
bun run build        # Build to dist/
bun run typecheck    # TypeScript type checking
bun run lint         # Run Biome + Ultracite
bun test             # Run test suite (Bun test runner)
```

### Environment
```bash
# Required for API access
export FAL_KEY="your-api-key"
```

## Common Tasks

### Adding a New Model
1. Add model configuration to [`MODELS`](src/api/models.ts:29) in `src/api/models.ts`
2. Update [`GENERATION_MODELS`](src/api/models.ts:116) or [`UTILITY_MODELS`](src/api/models.ts:120)
3. Add cost estimation logic in [`estimateCost()`](src/api/models.ts:160)
4. Update API request building in [`generate()`](src/api/fal.ts:68) if needed

### Adding a New Preset
1. Add to [`PRESETS`](src/studio/screens/Generate.tsx:49) in `Generate.tsx`
2. Add CLI flag in [`runCli()`](src/cli.ts:119) in `cli.ts`
3. Add preset logic in [`generateImage()`](src/cli.ts:235)

### Adding a New Screen
1. Add screen type to [`Screen`](src/studio/App.tsx:10) in `App.tsx`
2. Create component in `src/studio/screens/`
3. Add routing in [`renderScreen()`](src/studio/App.tsx:44)
4. Add navigation from appropriate screens

### Modifying Configuration
1. Update [`FalconConfig`](src/utils/config.ts:12) interface
2. Update [`DEFAULT_CONFIG`](src/utils/config.ts:44)
3. Add to [`SETTINGS`](src/studio/screens/Settings.tsx:19) for UI exposure

## Code Style

- **Indentation**: Tabs (configured in `biome.json`)
- **Quotes**: Double quotes
- **Import organization**: Automatic via Biome
- **Line endings**: LF
- **TypeScript**: Strict mode enabled

### Linting
```bash
# Auto-fix issues
bun run lint
```

## API Key Handling

The API key is resolved in this priority order:
1. `FAL_KEY` environment variable
2. `apiKey` in `~/.falcon/config.json`

Never commit API keys to the repository.

## Error Handling Patterns

### CLI Mode
```typescript
try {
  await operation();
} catch (err) {
  console.error(chalk.red(getErrorMessage(err)));
  process.exit(1);
}
```

### Studio Mode
Errors are passed to [`handleError`](src/studio/App.tsx:39) which displays them for 5 seconds:
```typescript
onError(new Error("Something went wrong"));
```

## Cost Tracking

Every generation is recorded with its cost and metadata:
- **Live pricing**: Estimates now prefer live `unit_price` from fal.ai API when available
- **Per-currency tracking**: Costs are tracked per currency (USD, EUR, etc.)
- **Session cost**: Reset on new run
- **Daily cost**: Reset each day
- **All-time cost**: Cumulative across all time
- **Cost metadata**: Includes currency, unit price, estimate source, and endpoint ID

Cost estimation priority:
1. Live API estimate (`estimateWithApi()`)
2. Cached unit price from pricing API
3. Static fallback estimates from [`models.ts`](src/api/models.ts:160)

Use `falcon pricing --refresh` to force refresh the pricing cache.

## Important Notes

1. **Bun Required**: This project uses Bun-specific APIs (`Bun.spawn`, `Bun.file`, `Bun.write`)
2. **macOS Optimized**: Image resizing uses `sips` (macOS built-in)
3. **Image Formats**: Supports PNG, JPG, WebP
4. **Security**: Output paths are validated to stay within current directory
5. **History Limit**: Only last 100 generations are kept (oldest auto-removed)
6. **Atomic Writes**: Config and history use temp-file + rename pattern for safety

## Testing

The project includes a comprehensive test suite using Bun's built-in test runner. See [`tests/TESTING_GUIDELINES.md`](tests/TESTING_GUIDELINES.md) for detailed testing guidelines.

### Running Tests
```bash
bun test                     # Run all tests
bun test --watch            # Run in watch mode for development
```

### Test Guidelines
- **Fast and deterministic**: Tests avoid live API calls and network access by mocking/stubbing external requests
- **Isolated**: Use temporary directories for config/history and output files; override environment variables within test processes
- **Platform-aware**: Some tests (like `resizeImage()`) are guarded for macOS (`process.platform === "darwin"`)
- **Mirror source structure**: Test files follow the same directory structure as source files for clarity

### Manual Testing
In addition to automated tests, you can manually test:
```bash
bun run dev                    # Launch studio
bun run dev "test prompt"      # CLI mode
bun run dev --help             # View all options
```

## Release Process

1. Update version in `package.json`
2. Run `bun run typecheck` and `bun run lint`
3. Build with `bun run build`
4. Test both CLI and Studio modes
5. Tag release: `git tag v1.x.x && git push --tags`
6. Update Homebrew tap if applicable

## Model Documentation

The following files contain detailed fal.ai API documentation for supported models:

- [`flux2_tti_llms.txt`](docs_for_AIs/flux2_tti_llms.txt) - Flux 2 text-to-image generation
- [`flux2_iti_llms.txt`](docs_for_AIs/flux2_iti_llms.txt) - Flux 2 image-to-image editing
- [`gemini3pro_tti_llms.txt`](docs_for_AIs/gemini3pro_tti_llms.txt) - Gemini 3 Pro text-to-image generation
- [`gemini3pro_iti_llms.txt`](docs_for_AIs/gemini3pro_iti_llms.txt) - Gemini 3 Pro image-to-image editing
- [`imagine_tti_llms.txt`](docs_for_AIs/imagine_tti_llms.txt) - Grok Imagine text-to-image generation
- [`imagine_iti_llms.txt`](docs_for_AIs/imagine_iti_llms.txt) - Grok Imagine image-to-image editing
- [`birefnet_llms.txt`](docs_for_AIs/birefnet_llms.txt) - Birefnet background removal docs
- [`bria_background_remove_llms.txt`](docs_for_AIs/bria_background_remove_llms.txt) - Bria background removal docs
- [`clarity_upscaler_llms.txt`](docs_for_AIs/clarity_upscaler_llms.txt) - Clarity upscaler docs
- [`crystal_upscaler_llms.txt`](docs_for_AIs/crystal_upscaler_llms.txt) - Crystal upscaler docs
- [`pricing.md`](docs_for_AIs/pricing.md) - Model pricing information
- [`estimate.md`](docs_for_AIs/estimate.md) - Cost estimation details

### Flux 2 Specifics

Flux 2 uses different parameter conventions than other models:

- **Image sizing**: Uses `image_size` enum (e.g., `landscape_4_3`, `square_hd`) instead of `aspect_ratio`
- **Unique parameters**:
  - `guidance_scale` (0-20, default 2.5) - Controls prompt adherence
  - `enable_prompt_expansion` (boolean) - Auto-expands prompts for better results
- **Endpoints**:
  - `flux2`: `fal-ai/flux-2` - Full quality Flux 2
  - `flux2Flash`: `fal-ai/flux-2/flash` - Fastest generation, lowest cost
  - `flux2Turbo`: `fal-ai/flux-2/turbo` - Balanced speed and quality
- **Mapping**: See [`aspectToFlux2Size()`](src/api/models.ts:189) for aspect ratio conversions

### Grok Imagine Specifics

Grok Imagine supports model-specific aspect ratios via the `supportedAspectRatios` configuration:

- **Image sizing**: Uses standard `aspect_ratio` parameter (like Gemini/Banana)
- **Unique aspect ratios**: `2:1`, `20:9`, `19.5:9`, `9:19.5`, `9:20`, `1:2` (in addition to common ratios)
- **Edit support**: Yes, via `/edit` endpoint
- **Returns**: `images[]` + `revised_prompt`
- **Pricing**: ~$0.04/image

### Gemini 3 Pro Specifics

Gemini 3 Pro (gemini-2.0-flash-exp-preview-05-30) is Google's latest image generation model:

- **Image sizing**: Uses standard `aspect_ratio` parameter
- **Resolution support**: Supports `1K`, `2K`, `4K` resolutions
- **Edit support**: Yes, via image editing endpoint
- **Returns**: `images[]` with generated images
- **Pricing**: ~$0.05/image

### Output Format Support

Grok, Flux 2, and Gemini 3 Pro models support the `output_format` parameter to specify the desired image format:

- **Supported formats**: `png`, `jpeg`, `webp`
- **CLI flag**: `--format <format>` or `-f <format>`
- **Default**: `png` (if not specified)
- **Studio UI**: Format selection available in the generation workflow

Example CLI usage:
```bash
falcon "a cat" --model grok --format webp
falcon "landscape" --model flux2 --format jpeg
```

The output format is passed directly to the fal.ai API and affects the generated image's MIME type and file extension.

### Model-Specific Aspect Ratios

The project supports model-specific aspect ratios through the `supportedAspectRatios` field in [`ModelConfig`](src/api/models.ts:17):

```typescript
// Models can declare their own supported aspect ratios
imagine: {
  ...
  supportedAspectRatios: ["1:1", "16:9", "9:16", "2:1", "20:9", ...],
}

// Helper function to get ratios for a model
getAspectRatiosForModel(model) -> AspectRatio[]
```

- Models without `supportedAspectRatios` use the common [`ASPECT_RATIOS`](src/api/models.ts:155)
- The Studio UI dynamically adjusts the grid layout based on the number of ratios
- See [`getAspectRatiosForModel()`](src/api/models.ts:263) for implementation

## Resources

- [fal.ai Documentation](https://fal.ai/docs)
- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [Bun Documentation](https://bun.sh/docs)
