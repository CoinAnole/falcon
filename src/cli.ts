import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import { generate, removeBackground, upscale } from "./api/fal";
import {
	ASPECT_RATIOS,
	type AspectRatio,
	GENERATION_MODELS,
	MODELS,
	OUTPUT_FORMATS,
	RESOLUTIONS,
	type Resolution,
} from "./api/models";
import {
	estimateBackgroundRemovalCost,
	estimateGenerationCost,
	estimateUpscaleCost,
	refreshPricingCache,
} from "./api/pricing";
import {
	addGeneration,
	type Generation,
	generateId,
	getApiKey,
	getLastGeneration,
	loadConfig,
	loadHistory,
} from "./utils/config";
import {
	deleteTempFile,
	downloadImage,
	generateFilename,
	getFileSize,
	getImageDimensions,
	imageToDataUrl,
	openImage,
	resizeImage,
} from "./utils/image";

/**
 * Get error message safely from unknown error type
 */
function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	return "Unknown error";
}

/**
 * Validate output path is safe (no path traversal, within cwd)
 */
function validateOutputPath(outputPath: string): string {
	const resolved = resolve(outputPath);
	const cwd = process.cwd();

	// Ensure path stays within current working directory
	const rel = relative(cwd, resolved);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(
			`Output path must be within current directory: ${outputPath}`,
		);
	}

	return resolved;
}

/**
 * Validate edit path exists and is a valid image
 */
function validateEditPath(editPath: string): string {
	const resolved = resolve(editPath);

	if (!existsSync(resolved)) {
		throw new Error(`Edit image not found: ${editPath}`);
	}

	const ext = resolved.toLowerCase();
	if (
		!ext.endsWith(".png") &&
		!ext.endsWith(".jpg") &&
		!ext.endsWith(".jpeg") &&
		!ext.endsWith(".webp")
	) {
		throw new Error(`Edit image must be PNG, JPG, or WebP: ${editPath}`);
	}

	return resolved;
}

interface CliOptions {
	refresh?: boolean;
	model?: string;
	edit?: string;
	aspect?: string;
	resolution?: string;
	output?: string;
	num?: string;
	// Format presets
	cover?: boolean;
	square?: boolean;
	landscape?: boolean;
	portrait?: boolean;
	// Social media presets
	story?: boolean;
	reel?: boolean;
	feed?: boolean;
	og?: boolean;
	// Device presets
	wallpaper?: boolean;
	// Cinematic presets
	wide?: boolean;
	ultra?: boolean;
	// Output options
	transparent?: boolean;
	last?: boolean;
	vary?: boolean;
	up?: boolean;
	rmbg?: boolean;
	scale?: string;
	noOpen?: boolean;
	// Flux 2 specific options
	guidanceScale?: string;
	promptExpansion?: boolean;
	inferenceSteps?: string;
	acceleration?: string;
	// Output format option
	format?: string;
}

export async function runCli(args: string[]): Promise<void> {
	const config = await loadConfig();
	let handledCommand = false;

	const program = new Command()
		.name("falcon")
		.description("fal.ai image generation CLI")
		.version("1.0.0")
		.argument("[prompt]", "Image generation prompt")
		.option(
			"-m, --model <model>",
			`Model to use (${GENERATION_MODELS.join(", ")})`,
		)
		.option("-e, --edit <file>", "Edit an existing image")
		.option(
			"-a, --aspect <ratio>",
			`Aspect ratio (${ASPECT_RATIOS.join(", ")})`,
		)
		.option("-r, --resolution <res>", `Resolution (${RESOLUTIONS.join(", ")})`)
		.option("-o, --output <file>", "Output filename")
		.option("-n, --num <count>", "Number of images 1-4")
		// Format presets
		.option("--cover", "Kindle/eBook cover: 2:3, 2K (1600×2400)")
		.option("--square", "Square: 1:1")
		.option("--landscape", "Landscape: 16:9")
		.option("--portrait", "Portrait: 2:3")
		// Social media presets
		.option("--story", "Instagram/TikTok Story: 9:16 (1080×1920)")
		.option("--reel", "Instagram Reel: 9:16 (1080×1920)")
		.option("--feed", "Instagram Feed portrait: 4:5 (1080×1350)")
		.option("--og", "Open Graph / social share: 16:9 (1200×630)")
		// Device presets
		.option("--wallpaper", "iPhone wallpaper: 9:16")
		// Cinematic presets
		.option("--wide", "Cinematic wide: 21:9")
		.option("--ultra", "Ultra-wide banner: 21:9, 2K")
		// Output options
		.option("--transparent", "Transparent background (PNG, GPT model only)")
		.option("--last", "Show last generation info")
		.option("--vary", "Generate variations of last image")
		.option("--up", "Upscale image (provide path, or uses last)")
		.option("--rmbg", "Remove background from last image")
		.option("--scale <factor>", "Upscale factor (for --up)")
		.option("--no-open", "Don't open image after generation")
		// Flux 2 specific options
		.option(
			"--guidance-scale <scale>",
			"Flux 2: guidance scale 0-20 (default: 2.5)",
		)
		.option(
			"--prompt-expansion",
			"Flux 2: enable prompt expansion for better results",
		)
		.option(
			"--inference-steps <steps>",
			"Flux 2 base: inference steps 4-50 (default: 28)",
		)
		.option(
			"--acceleration <level>",
			"Flux 2 base: acceleration level - none, regular, high (default: regular)",
		)
		.option(
			"-f, --format <format>",
			`Output format (${OUTPUT_FORMATS.join(", ")}) - for Grok, Flux, Gemini 3 Pro`,
		);

	program
		.command("pricing")
		.description("Pricing cache utilities")
		.option("--refresh", "Refresh cached pricing data")
		.action(async (commandOptions: CliOptions) => {
			handledCommand = true;
			if (!commandOptions.refresh) {
				console.log("Use --refresh to update cached pricing data.");
				return;
			}

			try {
				getApiKey(config);
			} catch (err) {
				console.error(chalk.red(getErrorMessage(err)));
				process.exit(1);
			}

			const endpointIds = Array.from(
				new Set(Object.values(MODELS).map((model) => model.endpoint)),
			);
			try {
				await refreshPricingCache(endpointIds);
				console.log(chalk.green("Pricing cache refreshed."));
			} catch (err) {
				console.error(chalk.red(getErrorMessage(err)));
				process.exit(1);
			}
		});

	program.parse(args);
	if (handledCommand) return;

	const options = program.opts<CliOptions>();
	const prompt = program.args[0];

	// Handle --last (doesn't need API key)
	if (options.last) {
		await showLastGeneration();
		return;
	}

	// Validate API key for operations that need it
	const requiresApiKey =
		prompt || options.vary || options.up || options.rmbg || options.edit;
	if (requiresApiKey) {
		try {
			getApiKey(config);
		} catch (err) {
			console.error(chalk.red(getErrorMessage(err)));
			process.exit(1);
		}
	}

	// Handle --vary (variations of last image)
	if (options.vary) {
		await generateVariations(prompt, options, config);
		return;
	}

	// Handle --up (upscale image - provided path or last)
	if (options.up) {
		await upscaleLast(prompt, options, config);
		return;
	}

	// Handle --rmbg (remove background from last image)
	if (options.rmbg) {
		await removeBackgroundLast(options, config);
		return;
	}

	// Regular generation requires a prompt
	if (!prompt) {
		// No prompt and no special flags = show help or launch studio
		// The entry point handles launching studio, so just show help here
		program.help();
		return;
	}

	await generateImage(prompt, options, config);
}

async function showLastGeneration(): Promise<void> {
	const last = await getLastGeneration();
	if (!last) {
		console.log(chalk.yellow("No previous generations found"));
		return;
	}

	const currency = last.costDetails?.currency || "USD";
	const estimateSource = last.costDetails?.estimateSource
		? ` (${last.costDetails.estimateSource})`
		: "";

	console.log(chalk.bold("\nLast Generation:"));
	console.log(
		`  Prompt: ${chalk.cyan(last.prompt.slice(0, 60))}${last.prompt.length > 60 ? "..." : ""}`,
	);
	console.log(
		`  Model:  ${chalk.green(MODELS[last.model]?.name || last.model)}`,
	);
	console.log(`  Aspect: ${last.aspect} | Resolution: ${last.resolution}`);
	console.log(`  Output: ${chalk.dim(last.output)}`);
	console.log(
		`  Cost:   ${chalk.yellow(`${currency} $${last.cost.toFixed(3)}`)}${estimateSource}`,
	);
	console.log(`  Time:   ${new Date(last.timestamp).toLocaleString()}`);
}

function formatEstimateLabel(cost: number, currency: string, source?: string) {
	const label = `${currency} $${cost.toFixed(3)}`;
	return source ? `${label} (${source})` : label;
}

function getHistoryTotals(history: Awaited<ReturnType<typeof loadHistory>>) {
	const currencies = Object.keys(history.totalCost);
	const currency = currencies[0] || "USD";
	return {
		currency,
		totals: history.totalCost[currency] || {
			session: 0,
			today: 0,
			allTime: 0,
		},
		additionalCurrencies: Math.max(0, currencies.length - 1),
	};
}

async function generateImage(
	prompt: string,
	options: CliOptions,
	config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
	// Apply presets
	let aspect: AspectRatio =
		(options.aspect as AspectRatio) || config.defaultAspect;
	let resolution: Resolution =
		(options.resolution as Resolution) || config.defaultResolution;

	// Apply presets (in priority order)
	if (options.cover) {
		// Kindle/eBook cover: 1600×2560 recommended, 2:3 is closest (1600×2400)
		aspect = "2:3";
		resolution = "2K";
	} else if (options.story || options.reel) {
		// Instagram Story/Reel: 1080×1920 (9:16)
		aspect = "9:16";
	} else if (options.feed) {
		// Instagram Feed portrait: 1080×1350 (4:5)
		aspect = "4:5";
	} else if (options.og) {
		// Open Graph social share: 1200×630 (~1.91:1), 16:9 is closest
		aspect = "16:9";
	} else if (options.wallpaper) {
		// iPhone wallpaper: 9:16 works for most models
		aspect = "9:16";
		resolution = "2K";
	} else if (options.ultra) {
		// Ultra-wide banner: 21:9, high res
		aspect = "21:9";
		resolution = "2K";
	} else if (options.wide) {
		// Cinematic wide: 21:9
		aspect = "21:9";
	} else if (options.square) {
		aspect = "1:1";
	} else if (options.landscape) {
		aspect = "16:9";
	} else if (options.portrait) {
		aspect = "2:3";
	}

	const model = options.model || config.defaultModel;
	const numImages = Math.min(4, Math.max(1, parseInt(options.num || "1", 10)));

	// Determine output format
	const modelConfig = MODELS[model];
	let outputFormat: string | undefined;
	if (modelConfig?.supportsOutputFormat) {
		// Validate format if provided
		if (options.format) {
			if (
				!OUTPUT_FORMATS.includes(
					options.format as (typeof OUTPUT_FORMATS)[number],
				)
			) {
				console.error(
					chalk.red(
						`Invalid format: ${options.format}. Valid options: ${OUTPUT_FORMATS.join(", ")}`,
					),
				);
				process.exit(1);
			}
			outputFormat = options.format;
		}
	} else if (options.format) {
		// User specified format but model doesn't support it
		console.warn(
			chalk.yellow(
				`Warning: Model ${model} does not support output format selection. Ignoring --format option.`,
			),
		);
	}

	// Determine file extension based on format or model
	let fileExt = "png";
	if (outputFormat) {
		fileExt = outputFormat;
	} else if (model === "gpt" && options.transparent) {
		fileExt = "png"; // GPT transparent mode uses PNG
	}

	// Validate output path if specified
	let outputPath: string;
	try {
		outputPath = options.output
			? validateOutputPath(options.output)
			: generateFilename("falcon", fileExt);
	} catch (err) {
		console.error(chalk.red(getErrorMessage(err)));
		process.exit(1);
	}

	if (!modelConfig) {
		console.error(chalk.red(`Unknown model: ${model}`));
		console.log(`Available models: ${GENERATION_MODELS.join(", ")}`);
		process.exit(1);
	}

	const estimate = await estimateGenerationCost({
		model,
		resolution,
		numImages,
	});
	const perImageCost = estimate.cost / numImages;

	// Show generation info
	console.log(chalk.bold(`\nModel: ${modelConfig.name}`));
	if (modelConfig.supportsAspect) {
		console.log(
			`Aspect: ${aspect} | Resolution: ${modelConfig.supportsResolution ? resolution : "N/A"}`,
		);
	}
	console.log(
		`Prompt: ${chalk.dim(prompt.slice(0, 80))}${prompt.length > 80 ? "..." : ""}`,
	);
	console.log(
		`Est. cost: ${chalk.yellow(
			formatEstimateLabel(
				estimate.cost,
				estimate.costDetails.currency,
				estimate.costDetails.estimateSource,
			),
		)}`,
	);

	// Handle edit mode
	let editImageData: string | undefined;
	let editPath: string | undefined;
	if (options.edit) {
		try {
			editPath = validateEditPath(options.edit);
		} catch (err) {
			console.error(chalk.red(getErrorMessage(err)));
			process.exit(1);
		}
		console.log(`Editing: ${chalk.dim(editPath)}`);

		const resized = await resizeImage(editPath, 1024);
		editImageData = await imageToDataUrl(resized);

		// Clean up temp file using safe utility
		if (resized !== editPath) {
			deleteTempFile(resized);
		}
	}

	const spinner = ora("Generating...").start();

	try {
		const result = await generate({
			prompt,
			model,
			aspect,
			resolution,
			numImages,
			editImage: editImageData,
			transparent: options.transparent,
			guidanceScale: options.guidanceScale
				? parseFloat(options.guidanceScale)
				: undefined,
			enablePromptExpansion: options.promptExpansion,
			numInferenceSteps: options.inferenceSteps
				? parseInt(options.inferenceSteps, 10)
				: undefined,
			acceleration: options.acceleration as
				| "none"
				| "regular"
				| "high"
				| undefined,
			outputFormat: outputFormat as "jpeg" | "png" | "webp" | undefined,
		});

		spinner.succeed("Generated!");

		// Download all images
		for (let i = 0; i < result.images.length; i++) {
			const image = result.images[i];
			const path =
				numImages > 1
					? outputPath.replace(`.${fileExt}`, `-${i + 1}.${fileExt}`)
					: outputPath;

			await downloadImage(image.url, path);

			const dims = await getImageDimensions(path);
			const size = await getFileSize(path);

			console.log(
				chalk.green(`✓ Saved: ${path}`) +
					chalk.dim(
						` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`,
					),
			);

			// Record generation
			const generation: Generation = {
				id: generateId(),
				prompt,
				model,
				aspect,
				resolution,
				output: resolve(path),
				cost: perImageCost,
				costDetails: {
					...estimate.costDetails,
					unitQuantity:
						estimate.costDetails.unitQuantity !== undefined
							? estimate.costDetails.unitQuantity / numImages
							: undefined,
				},
				timestamp: new Date().toISOString(),
				editedFrom: options.edit ? resolve(options.edit) : undefined,
			};
			await addGeneration(generation);

			// Open first image
			if (i === 0 && config.openAfterGenerate && !options.noOpen) {
				await openImage(path);
			}
		}

		// Show cost summary
		const history = await loadHistory();
		const totals = getHistoryTotals(history);
		const currencyLabel = totals.additionalCurrencies
			? `${totals.currency} (+${totals.additionalCurrencies} more)`
			: totals.currency;
		console.log(
			chalk.dim(
				`\nSession: ${currencyLabel} $${totals.totals.session.toFixed(2)} | Today: ${currencyLabel} $${totals.totals.today.toFixed(2)}`,
			),
		);
	} catch (err) {
		spinner.fail("Generation failed");
		console.error(chalk.red(getErrorMessage(err)));
		process.exit(1);
	}
}

async function generateVariations(
	customPrompt: string | undefined,
	options: CliOptions,
	config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
	const last = await getLastGeneration();
	if (!last) {
		console.error(chalk.red("No previous generation to create variations of"));
		process.exit(1);
	}

	// Use the last prompt or a custom one
	const prompt = customPrompt || last.prompt;
	const numImages = Math.min(4, Math.max(1, parseInt(options.num || "4", 10)));

	console.log(chalk.bold("\nGenerating variations..."));
	console.log(`Base: ${chalk.dim(last.prompt.slice(0, 50))}...`);

	// Generate with same settings as last
	await generateImage(
		prompt,
		{
			...options,
			model: options.model || last.model,
			aspect: options.aspect || last.aspect,
			resolution: options.resolution || last.resolution,
			num: String(numImages),
		},
		config,
	);
}

async function upscaleLast(
	imagePath: string | undefined,
	options: CliOptions,
	config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
	let sourceImagePath: string;
	let sourcePrompt = "[upscale]";
	let sourceAspect: AspectRatio = "1:1";
	let sourceResolution: Resolution = "1K";

	if (imagePath) {
		// User provided an image path - validate and use it
		try {
			sourceImagePath = validateEditPath(imagePath);
		} catch (err) {
			console.error(chalk.red(getErrorMessage(err)));
			process.exit(1);
		}
	} else {
		// Fall back to last generation
		const last = await getLastGeneration();
		if (!last) {
			console.error(chalk.red("No previous generation to upscale"));
			process.exit(1);
		}
		sourceImagePath = last.output;
		sourcePrompt = last.prompt;
		sourceAspect = last.aspect;
		sourceResolution = last.resolution;
	}

	const scaleFactor = parseInt(options.scale || "2", 10);
	const outputPath =
		options.output ||
		sourceImagePath.replace(
			/\.(png|jpg|jpeg|webp)$/i,
			`-up${scaleFactor}x.png`,
		);

	console.log(chalk.bold("\nUpscaling..."));
	console.log(`Source: ${chalk.dim(sourceImagePath)}`);
	console.log(`Scale: ${scaleFactor}x | Model: ${config.upscaler}`);

	const inputDims = await getImageDimensions(sourceImagePath);
	const estimate = await estimateUpscaleCost({
		model: config.upscaler,
		inputWidth: inputDims?.width,
		inputHeight: inputDims?.height,
		scaleFactor,
	});
	console.log(
		`Est. cost: ${chalk.yellow(
			formatEstimateLabel(
				estimate.cost,
				estimate.costDetails.currency,
				estimate.costDetails.estimateSource,
			),
		)}`,
	);

	const spinner = ora("Upscaling...").start();

	try {
		// Convert local file to data URL for upload
		const imageData = await imageToDataUrl(sourceImagePath);

		const result = await upscale({
			imageUrl: imageData,
			model: config.upscaler,
			scaleFactor,
		});

		spinner.succeed("Upscaled!");

		await downloadImage(result.images[0].url, outputPath);

		const dims = await getImageDimensions(outputPath);
		const size = await getFileSize(outputPath);

		console.log(
			chalk.green(`✓ Saved: ${outputPath}`) +
				chalk.dim(` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`),
		);

		// Record as generation
		await addGeneration({
			id: generateId(),
			prompt: `[upscale ${scaleFactor}x] ${sourcePrompt}`,
			model: config.upscaler,
			aspect: sourceAspect,
			resolution: sourceResolution,
			output: resolve(outputPath),
			cost: estimate.cost,
			costDetails: estimate.costDetails,
			timestamp: new Date().toISOString(),
			editedFrom: sourceImagePath,
		});

		if (config.openAfterGenerate && !options.noOpen) {
			await openImage(outputPath);
		}
	} catch (err) {
		spinner.fail("Upscale failed");
		console.error(chalk.red(getErrorMessage(err)));
		process.exit(1);
	}
}

async function removeBackgroundLast(
	options: CliOptions,
	config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
	const last = await getLastGeneration();
	if (!last) {
		console.error(
			chalk.red("No previous generation to remove background from"),
		);
		process.exit(1);
	}

	const outputPath = options.output || last.output.replace(".png", "-nobg.png");

	console.log(chalk.bold("\nRemoving background..."));
	console.log(`Source: ${chalk.dim(last.output)}`);
	console.log(`Model: ${config.backgroundRemover}`);

	const estimate = await estimateBackgroundRemovalCost({
		model: config.backgroundRemover,
	});
	console.log(
		`Est. cost: ${chalk.yellow(
			formatEstimateLabel(
				estimate.cost,
				estimate.costDetails.currency,
				estimate.costDetails.estimateSource,
			),
		)}`,
	);

	const spinner = ora("Processing...").start();

	try {
		const imageData = await imageToDataUrl(last.output);

		const result = await removeBackground({
			imageUrl: imageData,
			model: config.backgroundRemover,
		});

		spinner.succeed("Background removed!");

		await downloadImage(result.images[0].url, outputPath);

		const dims = await getImageDimensions(outputPath);
		const size = await getFileSize(outputPath);

		console.log(
			chalk.green(`✓ Saved: ${outputPath}`) +
				chalk.dim(` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`),
		);

		await addGeneration({
			id: generateId(),
			prompt: `[rmbg] ${last.prompt}`,
			model: config.backgroundRemover,
			aspect: last.aspect,
			resolution: last.resolution,
			output: resolve(outputPath),
			cost: estimate.cost,
			costDetails: estimate.costDetails,
			timestamp: new Date().toISOString(),
			editedFrom: last.output,
		});

		if (config.openAfterGenerate && !options.noOpen) {
			await openImage(outputPath);
		}
	} catch (err) {
		spinner.fail("Background removal failed");
		console.error(chalk.red(getErrorMessage(err)));
		process.exit(1);
	}
}

export function showHelp(): void {
	console.log(`
${chalk.bold("falcon")} - fal.ai image generation CLI

${chalk.bold("Usage:")}
  falcon                           Launch interactive studio
  falcon "prompt" [options]        Generate image from prompt
  falcon pricing --refresh          Refresh cached pricing data
  falcon --last                    Show last generation info
  falcon --vary                    Generate variations of last image
  falcon --up                      Upscale last image
  falcon --rmbg                    Remove background from last image

${chalk.bold("Options:")}
  -m, --model <model>      Model: gpt, banana, gemini, gemini3, flux2, flux2Flash, flux2Turbo, imagine
  -e, --edit <file>        Edit an existing image with prompt
  -a, --aspect <ratio>     Aspect ratio (see below)
  -r, --resolution <res>   Resolution: 1K, 2K, 4K
  -o, --output <file>      Output filename
  -n, --num <count>        Number of images (1-4)
  -f, --format <format>    Output format: jpeg, png, webp (Grok, Flux, Gemini 3 Pro)
  --transparent            Transparent background PNG (GPT only)
  --no-open                Don't auto-open image after generation

${chalk.bold("Flux 2 Options:")}
  --guidance-scale <n>     Guidance scale 0-20 (default: 2.5)
  --prompt-expansion       Enable prompt expansion for better results
  --inference-steps <n>    Base Flux 2 only: steps 4-50 (default: 28)
  --acceleration <level>   Base Flux 2 only: none, regular, high (default: regular)

${chalk.bold("Post-processing:")}
  --last                   Show last generation info
  --vary                   Generate variations of last image
  --up                     Upscale last image
  --rmbg                   Remove background from last image
  --scale <factor>         Upscale factor: 2, 4, 6, 8 (with --up)

${chalk.bold("Presets:")}
  ${chalk.dim("Format:")}
  --cover                  Kindle/eBook cover: 2:3, 2K
  --square                 Square: 1:1
  --landscape              Landscape: 16:9
  --portrait               Portrait: 2:3
  ${chalk.dim("Social Media:")}
  --story                  Instagram/TikTok Story: 9:16
  --reel                   Instagram Reel: 9:16
  --feed                   Instagram Feed: 4:5
  --og                     Open Graph / social share: 16:9
  ${chalk.dim("Devices:")}
  --wallpaper              iPhone wallpaper: 9:16, 2K
  ${chalk.dim("Cinematic:")}
  --wide                   Cinematic wide: 21:9
  --ultra                  Ultra-wide banner: 21:9, 2K

${chalk.bold("Aspect Ratios:")}
  21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16

${chalk.bold("Examples:")}
  falcon "a cat on a windowsill" -m gpt
  falcon "urban landscape" --landscape -r 4K
  falcon "add rain" -e photo.png
  falcon --vary -n 4
  falcon --up --scale 4
  falcon --rmbg
`);
}
