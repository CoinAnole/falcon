import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { generate, removeBackground, upscale } from "../../api/fal";
import {
	type AspectRatio,
	estimateCost,
	MODELS,
	type Resolution,
} from "../../api/models";
import {
	addGeneration,
	type FalconConfig,
	type Generation,
	generateId,
	loadHistory,
} from "../../utils/config";
import {
	downloadImage,
	generateFilename,
	getFileSize,
	getImageDimensions,
	imageToDataUrl,
	openImage,
} from "../../utils/image";
import { Spinner } from "../components/spinner";

const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;

function getModelForMode(
	mode: Mode,
	config: FalconConfig,
	sourceModel: string
): string {
	if (mode === "upscale") {
		return config.upscaler;
	}
	if (mode === "rmbg") {
		return config.backgroundRemover;
	}
	return sourceModel;
}

type Mode = "edit" | "variations" | "upscale" | "rmbg";
type Step =
	| "select"
	| "operation"
	| "prompt"
	| "scale"
	| "confirm"
	| "processing"
	| "done";

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

interface EditScreenProps {
	config: FalconConfig;
	onBack: () => void;
	onComplete: () => void;
	onError: (err: Error) => void;
	skipToOperation?: boolean;
}

export function EditScreen({
	config,
	onBack,
	onComplete,
	onError,
	skipToOperation = false,
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
	const [result, setResult] = useState<{
		path: string;
		dims: string;
		size: string;
	} | null>(null);

	// For custom path mode, create a pseudo-generation object
	const getSourceImage = (): {
		output: string;
		prompt: string;
		model: string;
		aspect: AspectRatio;
		resolution: Resolution;
	} => {
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

	useEffect(() => {
		const loadGenerations = async () => {
			const history = await loadHistory();
			if (history.generations.length === 0) {
				setUseCustomPath(true);
			} else {
				const latest = history.generations.at(-1) ?? null;
				setGenerations([...history.generations].reverse());
				setSelectedGen(latest);
				if (skipToOperation) {
					setStep("operation");
				}
			}
		};
		loadGenerations();
	}, [skipToOperation]);

	const proceedFromSelect = () => {
		if (useCustomPath) {
			const path = customPath.trim();
			if (!path) {
				return;
			}
			if (!existsSync(path)) {
				onError(new Error(`File not found: ${path}`));
				return;
			}
		} else if (!selectedGen) {
			return;
		}
		setStep("operation");
		setOperationIndex(0);
	};

	const proceedFromOperation = () => {
		const selectedMode = OPERATIONS[operationIndex].key;
		setMode(selectedMode);

		if (selectedMode === "edit") {
			setStep("prompt");
		} else if (selectedMode === "variations") {
			const source = getSourceImage();
			setPrompt(source.prompt);
			setStep("confirm");
		} else if (selectedMode === "upscale") {
			setStep("scale");
		} else if (selectedMode === "rmbg") {
			setStep("confirm");
		}
	};

	const handleEscape = () => {
		if (step === "processing") {
			return;
		}
		if (step === "done") {
			onComplete();
		} else if (step === "select") {
			onBack();
		} else if (step === "operation") {
			setStep("select");
		} else {
			setStep("operation");
		}
	};

	const handleHistoryListInput = (
		input: string,
		key: {
			upArrow?: boolean;
			downArrow?: boolean;
			tab?: boolean;
			return?: boolean;
			ctrl?: boolean;
			meta?: boolean;
		}
	) => {
		if (key.upArrow && selectedIndex > 0) {
			setSelectedIndex(selectedIndex - 1);
			setSelectedGen(generations[selectedIndex - 1]);
		} else if (key.downArrow && selectedIndex < generations.length - 1) {
			setSelectedIndex(selectedIndex + 1);
			setSelectedGen(generations[selectedIndex + 1]);
		} else if (key.tab) {
			setUseCustomPath(true);
		} else if (key.return) {
			proceedFromSelect();
		} else if (input && !key.ctrl && !key.meta) {
			setCustomPath(input);
			setUseCustomPath(true);
		}
	};

	const handleCustomPathInput = (key: { tab?: boolean }) => {
		if (key.tab && generations.length > 0) {
			setUseCustomPath(false);
		}
	};

	const handleSelectInput = (
		input: string,
		key: {
			upArrow?: boolean;
			downArrow?: boolean;
			tab?: boolean;
			return?: boolean;
			ctrl?: boolean;
			meta?: boolean;
		}
	) => {
		if (useCustomPath) {
			handleCustomPathInput(key);
		} else {
			handleHistoryListInput(input, key);
		}
	};

	const handleOperationInput = (key: {
		upArrow?: boolean;
		downArrow?: boolean;
		return?: boolean;
	}) => {
		if (key.upArrow && operationIndex > 0) {
			setOperationIndex(operationIndex - 1);
		} else if (key.downArrow && operationIndex < OPERATIONS.length - 1) {
			setOperationIndex(operationIndex + 1);
		} else if (key.return) {
			proceedFromOperation();
		}
	};

	const handleScaleInput = (key: {
		upArrow?: boolean;
		downArrow?: boolean;
		return?: boolean;
	}) => {
		if (key.upArrow && scale < 8) {
			setScale(scale + 1);
		} else if (key.downArrow && scale > 1) {
			setScale(scale - 1);
		} else if (key.return) {
			setStep("confirm");
		}
	};

	const handleConfirmInput = (input: string, key: { return?: boolean }) => {
		if (key.return || input === "y") {
			runProcess();
		} else if (input === "n") {
			setStep("operation");
		}
	};

	useInput((input, key) => {
		if (key.escape) {
			handleEscape();
			return;
		}

		if (step === "select") {
			handleSelectInput(input, key);
		} else if (step === "operation") {
			handleOperationInput(key);
		} else if (step === "scale") {
			handleScaleInput(key);
		} else if (step === "confirm") {
			handleConfirmInput(input, key);
		} else if (step === "done" && key.return) {
			onComplete();
		}
	});

	const handlePromptSubmit = (value: string) => {
		if (value.trim()) {
			setPrompt(value.trim());
			setStep("confirm");
		}
	};

	const runProcess = async () => {
		const source = getSourceImage();
		if (!(source && mode)) {
			return;
		}

		setStep("processing");

		try {
			let outputPath: string;
			let cost = 0;
			let promptLabel = "";

			if (mode === "edit") {
				setStatus("Preparing image...");
				const imageData = await imageToDataUrl(source.output);

				setStatus("Generating edit...");
				const result = await generate({
					prompt,
					model: "gpt", // GPT supports editing
					editImages: [imageData],
				});

				outputPath = generateFilename("falcon-edit");
				await downloadImage(result.images[0].url, outputPath);
				cost = estimateCost("gpt");
				promptLabel = prompt;
			} else if (mode === "variations") {
				setStatus("Generating variations...");
				const result = await generate({
					prompt: source.prompt,
					model: source.model,
					aspect: source.aspect,
					resolution: source.resolution,
					numImages: 1,
				});

				outputPath = generateFilename("falcon-edit");
				await downloadImage(result.images[0].url, outputPath);
				cost = estimateCost(source.model, source.resolution);
				promptLabel = source.prompt;
			} else if (mode === "upscale") {
				setStatus("Uploading image...");
				const imageData = await imageToDataUrl(source.output);

				setStatus("Upscaling...");
				const result = await upscale({
					imageUrl: imageData,
					model: config.upscaler,
					scaleFactor: scale,
				});

				outputPath = source.output.replace(IMAGE_EXT_REGEX, `-up${scale}x.png`);
				await downloadImage(result.images[0].url, outputPath);
				cost = 0.02;
				promptLabel = `[upscale ${scale}x] ${source.prompt}`;
			} else {
				// rmbg
				setStatus("Uploading image...");
				const imageData = await imageToDataUrl(source.output);

				setStatus("Removing background...");
				const result = await removeBackground({
					imageUrl: imageData,
					model: config.backgroundRemover,
				});

				outputPath = source.output.replace(IMAGE_EXT_REGEX, "-nobg.png");
				await downloadImage(result.images[0].url, outputPath);
				cost = 0.02;
				promptLabel = `[rmbg] ${source.prompt}`;
			}

			setStatus("Saving...");

			const dims = await getImageDimensions(outputPath);
			const size = await getFileSize(outputPath);

			await addGeneration({
				id: generateId(),
				prompt: promptLabel,
				model: getModelForMode(mode, config, source.model),
				aspect: source.aspect,
				resolution: source.resolution,
				output: resolve(outputPath),
				cost,
				timestamp: new Date().toISOString(),
				editedFrom: source.output,
			});

			const fullPath = resolve(outputPath);

			setResult({
				path: fullPath,
				dims: dims ? `${dims.width}x${dims.height}` : "?",
				size,
			});

			if (config.openAfterGenerate) {
				await openImage(fullPath);
			}

			setStep("done");
		} catch (err) {
			onError(err as Error);
			onBack();
		}
	};

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
								{generations.slice(0, 8).map((gen, index) => {
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
													{gen.prompt.slice(0, 32)}
													{gen.prompt.length > 32 ? "..." : ""}
												</Text>
											</Box>
											<Text dimColor>{basename(gen.output).slice(0, 20)}</Text>
										</Box>
									);
								})}
							</Box>
							{generations.length > 8 && (
								<Box marginLeft={1} marginTop={1}>
									<Text dimColor>
										+{generations.length - 8} more in gallery
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
									<Text
										bold={isSelected}
										color={isSelected ? "magenta" : undefined}
									>
										{isSelected ? "◆ " : "  "}
										{op.label.padEnd(18)}
									</Text>
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
									{prompt.slice(0, 40)}
									{prompt.length > 40 ? "..." : ""}
								</Text>
							</Text>
						)}
						{mode === "variations" && (
							<Text>
								Prompt:{" "}
								<Text color="cyan">{source.prompt.slice(0, 40)}...</Text>
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
