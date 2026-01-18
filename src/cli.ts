import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "path";

import { generate, upscale, removeBackground } from "./api/fal";
import {
  MODELS,
  GENERATION_MODELS,
  ASPECT_RATIOS,
  RESOLUTIONS,
  estimateCost,
  type AspectRatio,
  type Resolution,
} from "./api/models";
import {
  downloadImage,
  imageToDataUrl,
  resizeImage,
  generateFilename,
  openImage,
  getImageDimensions,
  getFileSize,
} from "./utils/image";
import {
  loadConfig,
  loadHistory,
  addGeneration,
  getLastGeneration,
  getApiKey,
  generateId,
  type Generation,
} from "./utils/config";

interface CliOptions {
  model?: string;
  edit?: string;
  aspect?: string;
  resolution?: string;
  output?: string;
  num?: string;
  cover?: boolean;
  square?: boolean;
  landscape?: boolean;
  portrait?: boolean;
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
    .name("falky")
    .description("fal.ai image generation CLI")
    .version("1.0.0")
    .argument("[prompt]", "Image generation prompt")
    .option("-m, --model <model>", `Model to use (${GENERATION_MODELS.join(", ")})`)
    .option("-e, --edit <file>", "Edit an existing image")
    .option("-a, --aspect <ratio>", `Aspect ratio (${ASPECT_RATIOS.join(", ")})`)
    .option("-r, --resolution <res>", `Resolution (${RESOLUTIONS.join(", ")})`)
    .option("-o, --output <file>", "Output filename")
    .option("-n, --num <count>", "Number of images 1-4")
    .option("--cover", "Book cover preset: 9:16, 2K")
    .option("--square", "Square preset: 1:1")
    .option("--landscape", "Landscape preset: 16:9")
    .option("--portrait", "Portrait preset: 2:3")
    .option("--last", "Show last generation info")
    .option("--vary", "Generate variations of last image")
    .option("--up", "Upscale last image")
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
  const requiresApiKey = prompt || options.vary || options.up || options.rmbg || options.edit;
  if (requiresApiKey) {
    try {
      getApiKey(config);
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  }

  // Handle --vary (variations of last image)
  if (options.vary) {
    await generateVariations(prompt, options, config);
    return;
  }

  // Handle --up (upscale last image)
  if (options.up) {
    await upscaleLast(options, config);
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
  console.log(`  Prompt: ${chalk.cyan(last.prompt.slice(0, 60))}${last.prompt.length > 60 ? "..." : ""}`);
  console.log(`  Model:  ${chalk.green(MODELS[last.model]?.name || last.model)}`);
  console.log(`  Aspect: ${last.aspect} | Resolution: ${last.resolution}`);
  console.log(`  Output: ${chalk.dim(last.output)}`);
  console.log(`  Cost:   ${chalk.yellow(`$${last.cost.toFixed(3)}`)}`);
  console.log(`  Time:   ${new Date(last.timestamp).toLocaleString()}`);
}

async function generateImage(
  prompt: string,
  options: CliOptions,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  // Apply presets
  let aspect: AspectRatio = (options.aspect as AspectRatio) || config.defaultAspect;
  let resolution: Resolution = (options.resolution as Resolution) || config.defaultResolution;

  if (options.cover) {
    aspect = "9:16";
    resolution = "2K";
  } else if (options.square) {
    aspect = "1:1";
  } else if (options.landscape) {
    aspect = "16:9";
  } else if (options.portrait) {
    aspect = "2:3";
  }

  const model = options.model || config.defaultModel;
  const numImages = Math.min(4, Math.max(1, parseInt(options.num || "1", 10)));
  const outputPath = options.output || generateFilename();

  const modelConfig = MODELS[model];
  if (!modelConfig) {
    console.error(chalk.red(`Unknown model: ${model}`));
    console.log(`Available models: ${GENERATION_MODELS.join(", ")}`);
    process.exit(1);
  }

  // Show generation info
  console.log(chalk.bold(`\nModel: ${modelConfig.name}`));
  if (modelConfig.supportsAspect) {
    console.log(`Aspect: ${aspect} | Resolution: ${modelConfig.supportsResolution ? resolution : "N/A"}`);
  }
  console.log(`Prompt: ${chalk.dim(prompt.slice(0, 80))}${prompt.length > 80 ? "..." : ""}`);
  console.log(`Est. cost: ${chalk.yellow(`$${estimateCost(model, resolution, numImages).toFixed(3)}`)}`);

  // Handle edit mode
  let editImageData: string | undefined;
  if (options.edit) {
    const editPath = resolve(options.edit);
    console.log(`Editing: ${chalk.dim(editPath)}`);

    const resized = await resizeImage(editPath, 1024);
    editImageData = await imageToDataUrl(resized);

    if (resized !== editPath) {
      await Bun.spawn(["rm", resized]).exited;
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
    });

    spinner.succeed("Generated!");

    // Download all images
    for (let i = 0; i < result.images.length; i++) {
      const image = result.images[i];
      const path = numImages > 1 ? outputPath.replace(".png", `-${i + 1}.png`) : outputPath;

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
        prompt,
        model,
        aspect,
        resolution,
        output: resolve(path),
        cost: estimateCost(model, resolution, 1),
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
    console.log(
      chalk.dim(`\nSession: $${history.totalCost.session.toFixed(2)} | Today: $${history.totalCost.today.toFixed(2)}`)
    );
  } catch (err) {
    spinner.fail("Generation failed");
    console.error(chalk.red((err as Error).message));
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
  const numImages = Math.min(4, Math.max(1, parseInt(options.num || "4", 10)));

  console.log(chalk.bold("\nGenerating variations..."));
  console.log(`Base: ${chalk.dim(last.prompt.slice(0, 50))}...`);

  // Generate with same settings as last
  await generateImage(prompt, {
    ...options,
    model: options.model || last.model,
    aspect: options.aspect || last.aspect,
    resolution: options.resolution || last.resolution,
    num: String(numImages),
  }, config);
}

async function upscaleLast(
  options: CliOptions,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    console.error(chalk.red("No previous generation to upscale"));
    process.exit(1);
  }

  const scaleFactor = parseInt(options.scale || "2", 10);
  const outputPath = options.output || last.output.replace(".png", `-up${scaleFactor}x.png`);

  console.log(chalk.bold("\nUpscaling..."));
  console.log(`Source: ${chalk.dim(last.output)}`);
  console.log(`Scale: ${scaleFactor}x | Model: ${config.upscaler}`);

  const spinner = ora("Upscaling...").start();

  try {
    // Convert local file to data URL for upload
    const imageData = await imageToDataUrl(last.output);

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
      prompt: `[upscale ${scaleFactor}x] ${last.prompt}`,
      model: config.upscaler,
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
    spinner.fail("Upscale failed");
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

async function removeBackgroundLast(
  options: CliOptions,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    console.error(chalk.red("No previous generation to remove background from"));
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
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}

export function showHelp(): void {
  console.log(`
${chalk.bold("falky")} - fal.ai image generation CLI

${chalk.bold("Usage:")}
  falky                           Launch interactive studio
  falky "prompt" [options]        Generate image from prompt
  falky --last                    Show last generation
  falky --vary                    Generate variations of last image
  falky --edit "prompt"           Edit last image
  falky --up                      Upscale last image
  falky --rmbg                    Remove background from last

${chalk.bold("Options:")}
  -m, --model <model>      Model: gpt, banana, gemini, gemini3
  -e, --edit <file>        Edit an existing image
  -a, --aspect <ratio>     Aspect: 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16
  -r, --resolution <res>   Resolution: 1K, 2K, 4K
  -o, --output <file>      Output filename
  -n, --num <count>        Number of images 1-4

${chalk.bold("Presets:")}
  --cover                  Book cover: 9:16, 2K
  --square                 Square: 1:1
  --landscape              Landscape: 16:9
  --portrait               Portrait: 2:3

${chalk.bold("Examples:")}
  falky "a cat on a windowsill" -m gpt
  falky "urban dusk" -m banana --cover -r 4K
  falky --vary -n 4
  falky --up --scale 4
`);
}
