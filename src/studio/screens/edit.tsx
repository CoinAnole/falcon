import { basename, resolve } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useState } from "react";
import { generate, removeBackground, upscale } from "../../api/fal";
import {
	type AspectRatio,
	type CliResolution,
	GENERATION_MODELS,
	MODELS,
} from "../../api/models";
import {
	estimateBackgroundRemovalCost,
	estimateGenerationCost,
	estimateUpscaleCost,
	type PricingEstimate,
} from "../../api/pricing";
import { isValidUpscaleFactor, UPSCALE_FACTORS } from "../../utils/constants";
import { Spinner } from "../components/spinner";
import {
	addGeneration,
	type FalconConfig,
	type Generation,
	generateId,
	loadHistory,
} from "../deps/config";
import {
	downloadImage,
	generateFilename,
	getFileSize,
	getImageDimensions,
	imageToDataUrl,
	openImage,
} from "../deps/image";
import { logger } from "../deps/logger";
import {
	isPathWithinCwd,
	validateImagePath,
	validateOutputPath,
} from "../deps/paths";

type Mode = "edit" | "variations" | "upscale" | "rmbg";
type Step =
	| "select"
	| "operation"
	| "edit-model"
	| "prompt"
	| "scale"
	| "confirm"
	| "processing"
	| "done";

type InitialOperation = "edit" | "variations" | "upscale" | "rmbg";

interface InputKey {
	escape?: boolean;
	upArrow?: boolean;
	downArrow?: boolean;
	tab?: boolean;
	return?: boolean;
	ctrl?: boolean;
	meta?: boolean;
	backspace?: boolean;
}

interface SourceImage {
	output: string;
	prompt: string;
	model: string;
	aspect: AspectRatio;
	resolution: CliResolution;
}

interface ProcessResult {
	outputPath: string;
	cost: number;
	costDetails?: PricingEstimate["costDetails"];
	promptLabel: string;
	resultSeed?: number;
}

const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;
const SEED_INPUT_REGEX = /^\d+$/;

const HISTORY_PROMPT_PREVIEW_LEN = 32;
const HISTORY_FILE_PREVIEW_LEN = 20;
const CONFIRM_PROMPT_PREVIEW_LEN = 40;
const MAX_VISIBLE_HISTORY_ITEMS = 8;

const OPERATIONS: { key: Mode; label: string; description: string }[] = [
	{ key: "edit", label: "Edit", description: "Modify with a new prompt" },
	{
		key: "variations",
		label: "Variations",
		description: "Generate similar images",
	},
	{ key: "upscale", label: "Upscale", description: "Enhance resolution" },
	{
		key: "rmbg",
		label: "Remove Background",
		description: "Transparent PNG output",
	},
];

const EDIT_MODELS = GENERATION_MODELS.filter((modelName) =>
	Boolean(MODELS[modelName]?.supportsEdit)
);

function truncateWithEllipsis(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength)}...`;
}

function getPreferredEditModel(
	sourceModel: string | undefined,
	fallbackModel = "gpt"
): string {
	if (sourceModel && MODELS[sourceModel]?.supportsEdit) {
		return sourceModel;
	}
	return fallbackModel;
}

function getEditModelIndex(modelName: string): number {
	const idx = EDIT_MODELS.indexOf(modelName);
	return idx >= 0 ? idx : 0;
}

function getHistoryModelForMode(
	mode: Mode,
	config: FalconConfig,
	sourceModel: string
): string {
	switch (mode) {
		case "upscale":
			return config.upscaler;
		case "rmbg":
			return config.backgroundRemover;
		default:
			return sourceModel;
	}
}

function buildPostProcessOutputPath(
	sourceOutput: string,
	sourceInCwd: boolean,
	suffix: string,
	fallbackPrefix: string
): string {
	if (sourceInCwd) {
		return validateOutputPath(sourceOutput.replace(IMAGE_EXT_REGEX, suffix));
	}

	return validateOutputPath(generateFilename(fallbackPrefix));
}

function isSeedEditableMode(
	mode: Mode | null
): mode is "edit" | "variations" | "upscale" {
	return mode === "edit" || mode === "variations" || mode === "upscale";
}

interface EditScreenProps {
	config: FalconConfig;
	onBack: () => void;
	onComplete: () => void;
	onError: (err: Error) => void;
	skipToOperation?: boolean;
	initialOperation?: InitialOperation;
}

export function EditScreen({
	config,
	onBack,
	onComplete,
	onError,
	skipToOperation = false,
	initialOperation,
}: EditScreenProps) {
	const [step, setStep] = useState<Step>("select");
	const [mode, setMode] = useState<Mode | null>(null);
	const [generations, setGenerations] = useState<Generation[]>([]);
	const [selectedGen, setSelectedGen] = useState<Generation | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [operationIndex, setOperationIndex] = useState(0);
	const [customPath, setCustomPath] = useState("");
	const [useCustomPath, setUseCustomPath] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [scale, setScale] = useState(2);
	const [status, setStatus] = useState("");
	const [seed, setSeed] = useState<number | undefined>(undefined);
	const [editModel, setEditModel] = useState<string>("gpt");
	const [editModelIndex, setEditModelIndex] = useState(0);
	const [result, setResult] = useState<{
		path: string;
		dims: string;
		size: string;
	} | null>(null);

	const getSourceImage = (): SourceImage => {
		if (useCustomPath && customPath) {
			return {
				output: customPath.trim(),
				prompt: basename(customPath),
				model: config.defaultModel,
				aspect: config.defaultAspect,
				resolution: config.defaultResolution,
			};
		}

		return selectedGen as Generation;
	};

	const setStepForOperation = (
		selectedMode: Mode,
		source: SourceImage
	): void => {
		setMode(selectedMode);

		switch (selectedMode) {
			case "edit": {
				const preferredModel = getPreferredEditModel(source.model);
				setEditModel(preferredModel);
				setEditModelIndex(getEditModelIndex(preferredModel));
				setStep("edit-model");
				return;
			}
			case "variations":
				setPrompt(source.prompt);
				setStep("confirm");
				return;
			case "upscale":
				setStep("scale");
				return;
			case "rmbg":
				setStep("confirm");
				return;
			default:
				setStep("operation");
		}
	};

	const applyInitialOperation = useCallback(
		(requestedOperation: InitialOperation, latest: Generation): void => {
			switch (requestedOperation) {
				case "edit": {
					const preferredModel = getPreferredEditModel(latest.model);
					setEditModel(preferredModel);
					setEditModelIndex(getEditModelIndex(preferredModel));
					setStep("edit-model");
					return;
				}
				case "variations":
					setMode("variations");
					setPrompt(latest.prompt);
					setStep("confirm");
					return;
				case "upscale":
					setMode("upscale");
					setStep("scale");
					return;
				case "rmbg":
					setMode("rmbg");
					setStep("confirm");
					return;
				default:
					setStep("operation");
			}
		},
		[]
	);

	useEffect(() => {
		let cancelled = false;

		const loadGenerationsFromHistory = async () => {
			const history = await loadHistory();
			if (cancelled) {
				return;
			}

			if (history.generations.length === 0) {
				setUseCustomPath(true);
				return;
			}

			const latest = history.generations.at(-1);
			if (!latest) {
				setUseCustomPath(true);
				return;
			}
			setGenerations([...history.generations].reverse());
			setSelectedGen(latest);

			if (!skipToOperation) {
				return;
			}

			if (initialOperation) {
				const opIndex = OPERATIONS.findIndex(
					(op) => op.key === initialOperation
				);
				setOperationIndex(opIndex >= 0 ? opIndex : 0);
				applyInitialOperation(initialOperation, latest);
				return;
			}

			setStep("operation");
		};

		loadGenerationsFromHistory();

		return () => {
			cancelled = true;
		};
	}, [skipToOperation, initialOperation, applyInitialOperation]);

	const proceedFromSelect = (): void => {
		if (useCustomPath) {
			const path = customPath.trim();
			if (!path) {
				return;
			}

			try {
				validateImagePath(path);
			} catch (err) {
				onError(err as Error);
				return;
			}
		} else if (!selectedGen) {
			return;
		}

		setStep("operation");
		setOperationIndex(0);
	};

	const proceedFromOperation = (): void => {
		const selectedMode = OPERATIONS[operationIndex]?.key;
		if (!selectedMode) {
			return;
		}

		setStepForOperation(selectedMode, getSourceImage());
	};

	const handleEscapeInput = (): void => {
		if (step === "processing") {
			return;
		}

		if (step === "done") {
			onComplete();
			return;
		}

		if (step === "select") {
			onBack();
			return;
		}

		if (step === "operation") {
			setStep("select");
			return;
		}

		setStep("operation");
	};

	const handleSelectHistoryInput = (input: string, key: InputKey): void => {
		if (key.upArrow && selectedIndex > 0) {
			setSelectedIndex(selectedIndex - 1);
			setSelectedGen(generations[selectedIndex - 1]);
			return;
		}

		if (key.downArrow && selectedIndex < generations.length - 1) {
			setSelectedIndex(selectedIndex + 1);
			setSelectedGen(generations[selectedIndex + 1]);
			return;
		}

		if (key.tab) {
			setUseCustomPath(true);
			return;
		}

		if (key.return) {
			proceedFromSelect();
			return;
		}

		if (input && !key.ctrl && !key.meta) {
			// User typed/pasted text (e.g. dragged a file) - switch to custom path mode.
			setCustomPath(input);
			setUseCustomPath(true);
		}
	};

	const handleSelectCustomPathInput = (key: InputKey): void => {
		if (key.tab && generations.length > 0) {
			setUseCustomPath(false);
		}
		// TextInput handles the rest.
	};

	const handleOperationInput = (key: InputKey): void => {
		if (key.upArrow && operationIndex > 0) {
			setOperationIndex(operationIndex - 1);
			return;
		}

		if (key.downArrow && operationIndex < OPERATIONS.length - 1) {
			setOperationIndex(operationIndex + 1);
			return;
		}

		if (key.return) {
			proceedFromOperation();
		}
	};

	const handleEditModelInput = (key: InputKey): void => {
		if (key.upArrow && editModelIndex > 0) {
			setEditModelIndex(editModelIndex - 1);
			return;
		}

		if (key.downArrow && editModelIndex < EDIT_MODELS.length - 1) {
			setEditModelIndex(editModelIndex + 1);
			return;
		}

		if (key.return) {
			const selectedEditModel = EDIT_MODELS[editModelIndex];
			if (!selectedEditModel) {
				return;
			}
			setEditModel(selectedEditModel);
			setStep("prompt");
		}
	};

	const handleScaleInput = (key: InputKey): void => {
		const currentIdx = UPSCALE_FACTORS.indexOf(
			scale as (typeof UPSCALE_FACTORS)[number]
		);

		if (key.upArrow && currentIdx < UPSCALE_FACTORS.length - 1) {
			setScale(UPSCALE_FACTORS[currentIdx + 1]);
			return;
		}

		if (key.downArrow && currentIdx > 0) {
			setScale(UPSCALE_FACTORS[currentIdx - 1]);
			return;
		}

		if (key.return) {
			setStep("confirm");
		}
	};

	const handleConfirmInput = (input: string, key: InputKey): void => {
		if (key.return || input === "y") {
			runProcess();
			return;
		}

		if (input === "n") {
			setStep("operation");
			return;
		}

		if (isSeedEditableMode(mode) && SEED_INPUT_REGEX.test(input)) {
			setSeed((currentSeed) => Number(`${currentSeed ?? ""}${input}`));
			return;
		}

		if (isSeedEditableMode(mode) && key.backspace) {
			setSeed((currentSeed) => {
				const asString = String(currentSeed ?? "");
				return asString.length > 1 ? Number(asString.slice(0, -1)) : undefined;
			});
		}
	};

	const handlePromptSubmit = (value: string): void => {
		const trimmed = value.trim();
		if (!trimmed) {
			return;
		}

		setPrompt(trimmed);
		setStep("confirm");
	};

	const runEditOperation = async (
		source: SourceImage
	): Promise<ProcessResult> => {
		setStatus("Preparing image...");
		const imageData = await imageToDataUrl(source.output);

		setStatus("Generating edit...");
		const result = await generate({
			prompt,
			model: editModel,
			editImage: imageData,
			enablePromptExpansion: config.promptExpansion,
			seed,
		});

		const outputPath = validateOutputPath(generateFilename("falcon-edit"));
		await downloadImage(result.images[0].url, outputPath);

		const estimate = await estimateGenerationCost({
			model: editModel,
			resolution: source.resolution,
			numImages: 1,
		});

		return {
			outputPath,
			cost: estimate.cost,
			costDetails: estimate.costDetails,
			promptLabel: prompt,
			resultSeed: result.seed,
		};
	};

	const runVariationOperation = async (
		source: SourceImage
	): Promise<ProcessResult> => {
		setStatus("Generating variations...");
		const result = await generate({
			prompt: source.prompt,
			model: source.model,
			aspect: source.aspect,
			resolution: source.resolution,
			numImages: 1,
			enablePromptExpansion: config.promptExpansion,
			seed,
		});

		const outputPath = validateOutputPath(generateFilename("falcon-edit"));
		await downloadImage(result.images[0].url, outputPath);

		const estimate = await estimateGenerationCost({
			model: source.model,
			resolution: source.resolution,
			numImages: 1,
		});

		return {
			outputPath,
			cost: estimate.cost,
			costDetails: estimate.costDetails,
			promptLabel: source.prompt,
			resultSeed: result.seed,
		};
	};

	const runUpscaleOperation = async (
		source: SourceImage
	): Promise<ProcessResult> => {
		if (!isValidUpscaleFactor(scale)) {
			throw new Error(
				`Invalid upscale factor. Choose ${UPSCALE_FACTORS.join(", ")}.`
			);
		}

		setStatus("Uploading image...");
		const imageData = await imageToDataUrl(source.output);

		setStatus("Upscaling...");
		const result = await upscale({
			imageUrl: imageData,
			model: config.upscaler,
			scaleFactor: scale,
			seed,
		});

		const outputPath = buildPostProcessOutputPath(
			source.output,
			isPathWithinCwd(source.output),
			`-up${scale}x.png`,
			"falcon-upscale"
		);
		await downloadImage(result.images[0].url, outputPath);

		const dims = await getImageDimensions(source.output);
		const estimate = await estimateUpscaleCost({
			model: config.upscaler,
			inputWidth: dims?.width,
			inputHeight: dims?.height,
			scaleFactor: scale,
		});

		return {
			outputPath,
			cost: estimate.cost,
			costDetails: estimate.costDetails,
			promptLabel: `[upscale ${scale}x] ${source.prompt}`,
			resultSeed: result.seed,
		};
	};

	const runBackgroundRemovalOperation = async (
		source: SourceImage
	): Promise<ProcessResult> => {
		setStatus("Uploading image...");
		const imageData = await imageToDataUrl(source.output);

		setStatus("Removing background...");
		const result = await removeBackground({
			imageUrl: imageData,
			model: config.backgroundRemover,
		});

		const outputPath = buildPostProcessOutputPath(
			source.output,
			isPathWithinCwd(source.output),
			"-nobg.png",
			"falcon-nobg"
		);
		await downloadImage(result.images[0].url, outputPath);

		const estimate = await estimateBackgroundRemovalCost({
			model: config.backgroundRemover,
		});

		return {
			outputPath,
			cost: estimate.cost,
			costDetails: estimate.costDetails,
			promptLabel: `[rmbg] ${source.prompt}`,
			resultSeed: result.seed,
		};
	};

	const runProcess = async (): Promise<void> => {
		const source = getSourceImage();
		if (!(source && mode)) {
			return;
		}

		setStep("processing");

		try {
			let processResult: ProcessResult;
			switch (mode) {
				case "edit":
					processResult = await runEditOperation(source);
					break;
				case "variations":
					processResult = await runVariationOperation(source);
					break;
				case "upscale":
					processResult = await runUpscaleOperation(source);
					break;
				case "rmbg":
					processResult = await runBackgroundRemovalOperation(source);
					break;
				default:
					return;
			}

			setStatus("Saving...");
			const dims = await getImageDimensions(processResult.outputPath);
			const size = getFileSize(processResult.outputPath);

			await addGeneration({
				id: generateId(),
				prompt: processResult.promptLabel,
				model: getHistoryModelForMode(mode, config, source.model),
				aspect: source.aspect,
				resolution: source.resolution,
				output: resolve(processResult.outputPath),
				cost: processResult.cost,
				costDetails: processResult.costDetails,
				timestamp: new Date().toISOString(),
				seed: processResult.resultSeed || seed,
				editedFrom: source.output,
			});

			const fullPath = resolve(processResult.outputPath);
			setResult({
				path: fullPath,
				dims: dims ? `${dims.width}x${dims.height}` : "?",
				size,
			});

			if (config.openAfterGenerate) {
				openImage(fullPath);
			}

			setStep("done");
		} catch (err) {
			logger.errorWithStack("Edit operation failed", err as Error, {
				mode,
				sourcePath: source.output,
				editModel,
				scale,
				seed,
			});
			onError(err as Error);
			onBack();
		}
	};

	useInput((input, key) => {
		if (key.escape) {
			handleEscapeInput();
			return;
		}

		switch (step) {
			case "select":
				if (useCustomPath) {
					handleSelectCustomPathInput(key);
				} else {
					handleSelectHistoryInput(input, key);
				}
				return;
			case "operation":
				handleOperationInput(key);
				return;
			case "edit-model":
				handleEditModelInput(key);
				return;
			case "scale":
				handleScaleInput(key);
				return;
			case "confirm":
				handleConfirmInput(input, key);
				return;
			case "done":
				if (key.return) {
					onComplete();
				}
				return;
			default:
				return;
		}
	});

	const source = step !== "select" ? getSourceImage() : null;

	return (
		<Box flexDirection="column">
			<Text bold>Edit</Text>

			{/* Image selection step */}
			{step === "select" && (
				<Box flexDirection="column" marginTop={1}>
					{useCustomPath ? (
						<>
							<Text dimColor>
								Enter path or drag file
								{generations.length > 0 ? " (tab for history)" : ""}
							</Text>
							<Box marginTop={1}>
								<Text color="magenta">◆ </Text>
								<TextInput
									onChange={setCustomPath}
									onSubmit={proceedFromSelect}
									placeholder="/path/to/image.png"
									value={customPath}
								/>
							</Box>
						</>
					) : (
						<>
							<Text dimColor>
								Select image (↑↓ navigate, tab for custom path)
							</Text>
							<Box flexDirection="column" marginTop={1}>
								{generations
									.slice(0, MAX_VISIBLE_HISTORY_ITEMS)
									.map((gen, index) => {
										const isSelected = index === selectedIndex;
										return (
											<Box key={gen.id} marginLeft={1}>
												<Text
													bold={isSelected}
													color={isSelected ? "magenta" : undefined}
												>
													{isSelected ? "◆ " : "  "}
												</Text>
												<Box width={40}>
													<Text color={isSelected ? "cyan" : undefined}>
														{truncateWithEllipsis(
															gen.prompt,
															HISTORY_PROMPT_PREVIEW_LEN
														)}
													</Text>
												</Box>
												<Text dimColor>
													{truncateWithEllipsis(
														basename(gen.output),
														HISTORY_FILE_PREVIEW_LEN
													)}
												</Text>
											</Box>
										);
									})}
							</Box>
							{generations.length > MAX_VISIBLE_HISTORY_ITEMS && (
								<Box marginLeft={1} marginTop={1}>
									<Text dimColor>
										+{generations.length - MAX_VISIBLE_HISTORY_ITEMS} more in
										gallery
									</Text>
								</Box>
							)}
						</>
					)}
				</Box>
			)}

			{/* Operation selection step */}
			{step === "operation" && source && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Source: {basename(source.output)}</Text>
					<Box flexDirection="column" marginTop={1}>
						{OPERATIONS.map((op, index) => {
							const isSelected = index === operationIndex;
							return (
								<Box key={op.key} marginLeft={1}>
									<Box width={20}>
										<Text
											bold={isSelected}
											color={isSelected ? "magenta" : undefined}
										>
											{isSelected ? "◆ " : "  "}
											{op.label}
										</Text>
									</Box>
									<Text dimColor={!isSelected}>{op.description}</Text>
								</Box>
							);
						})}
					</Box>
				</Box>
			)}

			{/* Show source after operation selection */}
			{step !== "select" && step !== "operation" && source && (
				<Box marginBottom={1} marginTop={1}>
					<Text dimColor>Source: {basename(source.output)}</Text>
				</Box>
			)}

			{/* Edit model selection */}
			{step === "edit-model" && (
				<Box flexDirection="column">
					<Text>Select model for editing:</Text>
					<Box flexDirection="column" marginTop={1}>
						{EDIT_MODELS.map((modelName, index) => (
							<Box key={modelName}>
								<Box width={22}>
									<Text
										bold={index === editModelIndex}
										color={index === editModelIndex ? "magenta" : undefined}
									>
										{index === editModelIndex ? "◆ " : "  "}
										{MODELS[modelName].name}
									</Text>
								</Box>
								<Text dimColor>{MODELS[modelName].pricing}</Text>
							</Box>
						))}
					</Box>
				</Box>
			)}

			{/* Prompt input for edit mode */}
			{step === "prompt" && (
				<Box flexDirection="column">
					<Text>Describe the edit:</Text>
					<Box marginTop={1}>
						<Text color="magenta">◆ </Text>
						<TextInput
							onChange={setPrompt}
							onSubmit={handlePromptSubmit}
							placeholder="Change the background to a beach..."
							value={prompt}
						/>
					</Box>
				</Box>
			)}

			{/* Scale selection for upscale */}
			{step === "scale" && (
				<Box flexDirection="column">
					<Text>Select upscale factor:</Text>
					<Box marginTop={1}>
						<Text bold color="magenta">
							◆ {scale}x
						</Text>
						<Text dimColor> (↑↓ to adjust, enter to confirm)</Text>
					</Box>
				</Box>
			)}

			{/* Confirmation */}
			{step === "confirm" && source && mode && (
				<Box flexDirection="column">
					<Text bold>Ready to process:</Text>
					<Box flexDirection="column" marginLeft={2} marginTop={1}>
						{mode === "edit" && (
							<Text>
								Edit:{" "}
								<Text color="cyan">
									{truncateWithEllipsis(prompt, CONFIRM_PROMPT_PREVIEW_LEN)}
								</Text>
							</Text>
						)}
						{mode === "variations" && (
							<Text>
								Prompt:{" "}
								<Text color="cyan">
									{truncateWithEllipsis(
										source.prompt,
										CONFIRM_PROMPT_PREVIEW_LEN
									)}
								</Text>
							</Text>
						)}
						{mode === "upscale" && (
							<>
								<Text>
									Scale: <Text color="cyan">{scale}x</Text>
								</Text>
								<Text>
									Model:{" "}
									<Text color="green">{MODELS[config.upscaler]?.name}</Text>
								</Text>
							</>
						)}
						{mode === "rmbg" && (
							<Text>
								Model:{" "}
								<Text color="green">
									{MODELS[config.backgroundRemover]?.name}
								</Text>
							</Text>
						)}
						<Text>
							Seed: <Text color="cyan">{seed ?? "random"}</Text>
							<Text dimColor> (type digits to set)</Text>
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text>Proceed? </Text>
						<Text bold color="green">
							[Y]es
						</Text>
						<Text> / </Text>
						<Text color="red">[N]o</Text>
					</Box>
				</Box>
			)}

			{/* Processing */}
			{step === "processing" && (
				<Box>
					<Spinner text={status} />
				</Box>
			)}

			{/* Done */}
			{step === "done" && result && (
				<Box flexDirection="column">
					<Text bold color="green">
						◆ Complete
					</Text>
					<Box flexDirection="column" marginLeft={2} marginTop={1}>
						<Text>
							Saved: <Text color="cyan">{result.path}</Text>
						</Text>
						<Text dimColor>
							{result.dims} · {result.size}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text dimColor>enter to continue</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}
