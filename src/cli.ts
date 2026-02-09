import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import { generate, removeBackground, upscale } from "./api/fal";

const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;

import {
	ASPECT_RATIOS,
	type AspectRatio,
	estimateCost,
	GENERATION_MODELS,
	MODELS,
	RESOLUTIONS,
	type Resolution,
} from "./api/models";
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
	downloadImage,
	generateFilename,
	getFileSize,
	getImageDimensions,
	imageToDataUrl,
	openImage,
} from "./utils/image";

/**
 * Get error message safely from unknown error type
 */
function getErrorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	if (typeof err === "string") {
		return err;
	}
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
			`Output path must be within current directory: ${outputPath}`
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
		!(
			ext.endsWith(".png") ||
			ext.endsWith(".jpg") ||
			ext.endsWith(".jpeg") ||
			ext.endsWith(".webp")
		)
	) {
		throw new Error(`Edit image must be PNG, JPG, or WebP: ${editPath}`);
	}

	return resolved;
}

interface CliOptions {
	model?: string;
	edit?: string[];
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
	loose?: boolean;
	last?: boolean;
	vary?: boolean;
	up?: boolean;
	rmbg?: boolean;
	scale?: string;
	noOpen?: boolean;
}

export async function runCli(args: string[]): Promise<void> {
	const config = await loadConfig();

	const program = new Command()
		.name("falcon")
		.description("fal.ai image generation CLI")
		.version("1.0.0")
		.argument("[prompt]", "Image generation prompt")
		.option(
			"-m, --model <model>",
			`Model to use (${GENERATION_MODELS.join(", ")})`
		)
		.option("-e, --edit <files...>", "Reference image(s) for editing")
		.option("--loose", "Use reference as loose inspiration (GPT only)")
		.option(
			"-a, --aspect <ratio>",
			`Aspect ratio (${ASPECT_RATIOS.join(", ")})`
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
		.option("--no-open", "Don't open image after generation");

	program.parse(args);

	const options = program.opts<CliOptions>();
	const prompt = program.args[0];

	// Handle --last (doesn't need API key)
	if (options.last) {
		await showLastGeneration();
		return;
	}

	// Validate API key for operations that need it
	const requiresApiKey =
		prompt ||
		options.vary ||
		options.up ||
		options.rmbg ||
		options.edit?.length;
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

	console.log(chalk.bold("\nLast Generation:"));
	console.log(
		`  Prompt: ${chalk.cyan(last.prompt.slice(0, 60))}${last.prompt.length > 60 ? "..." : ""}`
	);
	console.log(
		`  Model:  ${chalk.green(MODELS[last.model]?.name || last.model)}`
	);
	console.log(`  Aspect: ${last.aspect} | Resolution: ${last.resolution}`);
	console.log(`  Output: ${chalk.dim(last.output)}`);
	console.log(`  Cost:   ${chalk.yellow(`$${last.cost.toFixed(3)}`)}`);
	console.log(`  Time:   ${new Date(last.timestamp).toLocaleString()}`);
}

/**
 * Resolve aspect ratio and resolution from CLI preset flags
 */
function resolvePreset(
	options: CliOptions,
	defaultAspect: AspectRatio,
	defaultResolution: Resolution
): { aspect: AspectRatio; resolution: Resolution } {
	if (options.cover) {
		return { aspect: "2:3", resolution: "2K" };
	}
	if (options.story || options.reel) {
		return { aspect: "9:16", resolution: defaultResolution };
	}
	if (options.feed) {
		return { aspect: "4:5", resolution: defaultResolution };
	}
	if (options.og) {
		return { aspect: "16:9", resolution: defaultResolution };
	}
	if (options.wallpaper) {
		return { aspect: "9:16", resolution: "2K" };
	}
	if (options.ultra) {
		return { aspect: "21:9", resolution: "2K" };
	}
	if (options.wide) {
		return { aspect: "21:9", resolution: defaultResolution };
	}
	if (options.square) {
		return { aspect: "1:1", resolution: defaultResolution };
	}
	if (options.landscape) {
		return { aspect: "16:9", resolution: defaultResolution };
	}
	if (options.portrait) {
		return { aspect: "2:3", resolution: defaultResolution };
	}
	return {
		aspect: (options.aspect as AspectRatio) || defaultAspect,
		resolution: (options.resolution as Resolution) || defaultResolution,
	};
}

/**
 * Validate edit/reference image paths from CLI options
 */
function resolveEditPaths(
	editFiles: string[] | undefined,
	modelConfig: { maxReferenceImages?: number; name: string }
): string[] | undefined {
	if (!editFiles?.length) {
		return undefined;
	}

	const maxRef = modelConfig.maxReferenceImages || 1;
	if (editFiles.length > maxRef) {
		console.error(
			chalk.red(
				`${modelConfig.name} supports at most ${maxRef} reference images, got ${editFiles.length}`
			)
		);
		process.exit(1);
	}

	try {
		return editFiles.map((p) => validateEditPath(p));
	} catch (err) {
		console.error(chalk.red(getErrorMessage(err)));
		process.exit(1);
	}
}

/**
 * Download generated images, log results, and record in history
 */
async function saveGeneratedImages(
	images: { url: string }[],
	outputPath: string,
	numImages: number,
	meta: {
		prompt: string;
		model: string;
		aspect: AspectRatio;
		resolution: Resolution;
		editPaths?: string[];
	},
	config: Awaited<ReturnType<typeof loadConfig>>,
	noOpen?: boolean
): Promise<void> {
	for (let i = 0; i < images.length; i++) {
		const image = images[i];
		const path =
			numImages > 1 ? outputPath.replace(".png", `-${i + 1}.png`) : outputPath;

		await downloadImage(image.url, path);

		const dims = await getImageDimensions(path);
		const size = await getFileSize(path);

		console.log(
			chalk.green(`✓ Saved: ${path}`) +
				chalk.dim(` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`)
		);

		// Record generation
		const generation: Generation = {
			id: generateId(),
			prompt: meta.prompt,
			model: meta.model,
			aspect: meta.aspect,
			resolution: meta.resolution,
			output: resolve(path),
			cost: estimateCost(meta.model, meta.resolution, 1),
			timestamp: new Date().toISOString(),
			editedFrom: meta.editPaths?.[0] ? resolve(meta.editPaths[0]) : undefined,
		};
		await addGeneration(generation);

		// Open first image
		if (i === 0 && config.openAfterGenerate && !noOpen) {
			await openImage(path);
		}
	}

	// Show cost summary
	const history = await loadHistory();
	console.log(
		chalk.dim(
			`\nSession: $${history.totalCost.session.toFixed(2)} | Today: $${history.totalCost.today.toFixed(2)}`
		)
	);
}

async function generateImage(
	prompt: string,
	options: CliOptions,
	config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
	const { aspect, resolution } = resolvePreset(
		options,
		config.defaultAspect,
		config.defaultResolution
	);

	const model = options.model || config.defaultModel;
	const numImages = Math.min(
		4,
		Math.max(1, Number.parseInt(options.num || "1", 10))
	);

	// Validate output path if specified
	let outputPath: string;
	try {
		outputPath = options.output
			? validateOutputPath(options.output)
			: generateFilename();
	} catch (err) {
		console.error(chalk.red(getErrorMessage(err)));
		process.exit(1);
	}

	const modelConfig = MODELS[model];
	if (!modelConfig) {
		console.error(chalk.red(`Unknown model: ${model}`));
		console.log(`Available models: ${GENERATION_MODELS.join(", ")}`);
		process.exit(1);
	}

	// Show generation info
	console.log(chalk.bold(`\nModel: ${modelConfig.name}`));
	if (modelConfig.supportsAspect) {
		console.log(
			`Aspect: ${aspect} | Resolution: ${modelConfig.supportsResolution ? resolution : "N/A"}`
		);
	}
	console.log(
		`Prompt: ${chalk.dim(prompt.slice(0, 80))}${prompt.length > 80 ? "..." : ""}`
	);
	console.log(
		`Est. cost: ${chalk.yellow(`$${estimateCost(model, resolution, numImages).toFixed(3)}`)}`
	);

	// Handle edit/reference mode — validate paths, upload happens in generate()
	const editPaths = resolveEditPaths(options.edit, modelConfig);
	if (editPaths) {
		console.log(`References: ${chalk.dim(editPaths.join(", "))}`);
	}

	const spinner = ora("Generating...").start();

	try {
		const result = await generate({
			prompt,
			model,
			aspect,
			resolution,
			numImages,
			editImages: editPaths,
			transparent: options.transparent,
			inputFidelity: options.loose ? "low" : undefined,
		});

		spinner.succeed("Generated!");

		await saveGeneratedImages(
			result.images,
			outputPath,
			numImages,
			{ prompt, model, aspect, resolution, editPaths },
			config,
			options.noOpen
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
	config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
	const last = await getLastGeneration();
	if (!last) {
		console.error(chalk.red("No previous generation to create variations of"));
		process.exit(1);
	}

	// Use the last prompt or a custom one
	const prompt = customPrompt || last.prompt;
	const numImages = Math.min(
		4,
		Math.max(1, Number.parseInt(options.num || "4", 10))
	);

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
		config
	);
}

async function upscaleLast(
	imagePath: string | undefined,
	options: CliOptions,
	config: Awaited<ReturnType<typeof loadConfig>>
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

	const scaleFactor = Number.parseInt(options.scale || "2", 10);
	const outputPath =
		options.output ||
		sourceImagePath.replace(IMAGE_EXT_REGEX, `-up${scaleFactor}x.png`);

	console.log(chalk.bold("\nUpscaling..."));
	console.log(`Source: ${chalk.dim(sourceImagePath)}`);
	console.log(`Scale: ${scaleFactor}x | Model: ${config.upscaler}`);

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
				chalk.dim(` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`)
		);

		// Record as generation
		await addGeneration({
			id: generateId(),
			prompt: `[upscale ${scaleFactor}x] ${sourcePrompt}`,
			model: config.upscaler,
			aspect: sourceAspect,
			resolution: sourceResolution,
			output: resolve(outputPath),
			cost: 0.02,
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
	config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
	const last = await getLastGeneration();
	if (!last) {
		console.error(
			chalk.red("No previous generation to remove background from")
		);
		process.exit(1);
	}

	const outputPath = options.output || last.output.replace(".png", "-nobg.png");

	console.log(chalk.bold("\nRemoving background..."));
	console.log(`Source: ${chalk.dim(last.output)}`);
	console.log(`Model: ${config.backgroundRemover}`);

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
				chalk.dim(` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`)
		);

		await addGeneration({
			id: generateId(),
			prompt: `[rmbg] ${last.prompt}`,
			model: config.backgroundRemover,
			aspect: last.aspect,
			resolution: last.resolution,
			output: resolve(outputPath),
			cost: 0.02,
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
  falcon --last                    Show last generation info
  falcon --vary                    Generate variations of last image
  falcon --up                      Upscale last image
  falcon --rmbg                    Remove background from last image

${chalk.bold("Options:")}
  -m, --model <model>      Model: gpt, banana, gemini, gemini3
  -e, --edit <files...>    Reference image(s) for editing
  --loose                  Use reference as loose inspiration (GPT only)
  -a, --aspect <ratio>     Aspect ratio (see below)
  -r, --resolution <res>   Resolution: 1K, 2K, 4K
  -o, --output <file>      Output filename
  -n, --num <count>        Number of images (1-4)
  --transparent            Transparent background PNG (GPT only)
  --no-open                Don't auto-open image after generation

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
  falcon "blend these" -e img1.png img2.png -m banana
  falcon "a sunset" -e photo.png --loose -m gpt
  falcon --vary -n 4
  falcon --up --scale 4
  falcon --rmbg
`);
}
