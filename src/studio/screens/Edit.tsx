import { basename, resolve } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { generate, removeBackground, upscale } from "../../api/fal";
import {
	type AspectRatio,
	estimateCost,
	GENERATION_MODELS,
	MODELS,
	type Resolution,
} from "../../api/models";
import {
	estimateBackgroundRemovalCost,
	estimateGenerationCost,
	estimateUpscaleCost,
	type PricingEstimate,
} from "../../api/pricing";
import {
	addGeneration,
	type FalconConfig,
	type Generation,
	generateId,
	loadHistory,
} from "../../utils/config";
import { isValidUpscaleFactor, UPSCALE_FACTORS } from "../../utils/constants";
import {
	downloadImage,
	generateFilename,
	getFileSize,
	getImageDimensions,
	imageToDataUrl,
	openImage,
} from "../../utils/image";
import {
	isPathWithinCwd,
	validateImagePath,
	validateOutputPath,
} from "../../utils/paths";
import { Spinner } from "../components/Spinner";

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
	const [seed, setSeed] = useState<number | undefined>(undefined);
	const [editModel, setEditModel] = useState<string>("gpt");
	const [editModelIndex, setEditModelIndex] = useState(0);
	const [result, setResult] = useState<{
		path: string;
		dims: string;
		size: string;
	} | null>(null);

	// Get models that support editing
	const EDIT_MODELS = GENERATION_MODELS.filter((m) => MODELS[m]?.supportsEdit);

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
				const latest = history.generations[history.generations.length - 1];
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
			if (!path) return;
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

	const proceedFromOperation = () => {
		const selectedMode = OPERATIONS[operationIndex].key;
		setMode(selectedMode);

		if (selectedMode === "edit") {
			// Initialize edit model selection - prefer source model if it supports edit
			const source = getSourceImage();
			const preferredModel =
				source?.model && MODELS[source.model]?.supportsEdit
					? source.model
					: "gpt";
			setEditModel(preferredModel);
			setEditModelIndex(EDIT_MODELS.indexOf(preferredModel));
			setStep("edit-model");
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

	useInput((input, key) => {
		if (key.escape) {
			if (step === "processing") return;
			if (step === "done") {
				onComplete();
			} else if (step === "select") {
				onBack();
			} else if (step === "operation") {
				setStep("select");
			} else {
				// Go back to operation step
				setStep("operation");
			}
			return;
		}

		if (step === "select" && !useCustomPath) {
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
				// User typed/pasted text (e.g. dragged a file) - switch to custom path mode
				setCustomPath(input);
				setUseCustomPath(true);
			}
		} else if (step === "select" && useCustomPath) {
			if (key.tab && generations.length > 0) {
				setUseCustomPath(false);
			}
			// TextInput handles the rest
		} else if (step === "operation") {
			if (key.upArrow && operationIndex > 0) {
				setOperationIndex(operationIndex - 1);
			} else if (key.downArrow && operationIndex < OPERATIONS.length - 1) {
				setOperationIndex(operationIndex + 1);
			} else if (key.return) {
				proceedFromOperation();
			}
		} else if (step === "edit-model") {
			if (key.upArrow && editModelIndex > 0) {
				setEditModelIndex(editModelIndex - 1);
			} else if (key.downArrow && editModelIndex < EDIT_MODELS.length - 1) {
				setEditModelIndex(editModelIndex + 1);
			} else if (key.return) {
				setEditModel(EDIT_MODELS[editModelIndex]);
				setStep("prompt");
			}
		} else if (step === "scale") {
			if (key.upArrow) {
				const currentIdx = UPSCALE_FACTORS.indexOf(
					scale as (typeof UPSCALE_FACTORS)[number],
				);
				if (currentIdx < UPSCALE_FACTORS.length - 1) {
					setScale(UPSCALE_FACTORS[currentIdx + 1]);
				}
			} else if (key.downArrow) {
				const currentIdx = UPSCALE_FACTORS.indexOf(
					scale as (typeof UPSCALE_FACTORS)[number],
				);
				if (currentIdx > 0) {
					setScale(UPSCALE_FACTORS[currentIdx - 1]);
				}
			} else if (key.return) {
				setStep("confirm");
			}
		} else if (step === "confirm") {
			if (key.return || input === "y") {
				runProcess();
			} else if (input === "n") {
				setStep("operation");
			} else if (
				(mode === "upscale" || mode === "variations" || mode === "edit") &&
				/^\d+$/.test(input)
			) {
				setSeed((s) => Number(`${s ?? ""}${input}`));
			} else if (
				(mode === "upscale" || mode === "variations" || mode === "edit") &&
				key.backspace
			) {
				setSeed((s) => {
					const str = String(s ?? "");
					return str.length > 1 ? Number(str.slice(0, -1)) : undefined;
				});
			}
		} else if (step === "done") {
			if (key.return) {
				onComplete();
			}
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
		if (!source || !mode) return;

		setStep("processing");

		try {
			let outputPath: string;
			let cost = 0;
			let costDetails: PricingEstimate["costDetails"] | undefined;
			let promptLabel = "";

			if (mode === "edit") {
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

				outputPath = validateOutputPath(generateFilename("falcon-edit"));
				await downloadImage(result.images[0].url, outputPath);
				const estimate = await estimateGenerationCost({
					model: editModel,
					resolution: source.resolution,
					numImages: 1,
				});
				cost = estimate.cost;
				costDetails = estimate.costDetails;
				promptLabel = prompt;
			} else if (mode === "variations") {
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

				outputPath = validateOutputPath(generateFilename("falcon-edit"));
				await downloadImage(result.images[0].url, outputPath);
				const estimate = await estimateGenerationCost({
					model: source.model,
					resolution: source.resolution,
					numImages: 1,
				});
				cost = estimate.cost;
				costDetails = estimate.costDetails;
				promptLabel = source.prompt;
			} else if (mode === "upscale") {
				if (!isValidUpscaleFactor(scale)) {
					throw new Error(
						`Invalid upscale factor. Choose ${UPSCALE_FACTORS.join(", ")}.`,
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

				const sourceInCwd = isPathWithinCwd(source.output);
				outputPath = sourceInCwd
					? validateOutputPath(
							source.output.replace(
								/\.(png|jpg|jpeg|webp)$/i,
								`-up${scale}x.png`,
							),
						)
					: validateOutputPath(generateFilename("falcon-upscale"));
				await downloadImage(result.images[0].url, outputPath);
				const dims = await getImageDimensions(source.output);
				const estimate = await estimateUpscaleCost({
					model: config.upscaler,
					inputWidth: dims?.width,
					inputHeight: dims?.height,
					scaleFactor: scale,
				});
				cost = estimate.cost;
				costDetails = estimate.costDetails;
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

				const sourceInCwd = isPathWithinCwd(source.output);
				outputPath = sourceInCwd
					? validateOutputPath(
							source.output.replace(/\.(png|jpg|jpeg|webp)$/i, "-nobg.png"),
						)
					: validateOutputPath(generateFilename("falcon-nobg"));
				await downloadImage(result.images[0].url, outputPath);
				const estimate = await estimateBackgroundRemovalCost({
					model: config.backgroundRemover,
				});
				cost = estimate.cost;
				costDetails = estimate.costDetails;
				promptLabel = `[rmbg] ${source.prompt}`;
			}

			setStatus("Saving...");

			const dims = await getImageDimensions(outputPath);
			const size = await getFileSize(outputPath);

			await addGeneration({
				id: generateId(),
				prompt: promptLabel,
				model:
					mode === "upscale"
						? config.upscaler
						: mode === "rmbg"
							? config.backgroundRemover
							: source.model,
				aspect: source.aspect,
				resolution: source.resolution,
				output: resolve(outputPath),
				cost,
				costDetails,
				timestamp: new Date().toISOString(),
				seed: result.seed || seed,
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
					{!useCustomPath ? (
						<>
							<Text dimColor>
								Select image (↑↓ navigate, tab for custom path)
							</Text>
							<Box marginTop={1} flexDirection="column">
								{generations.slice(0, 8).map((gen, index) => {
									const isSelected = index === selectedIndex;
									return (
										<Box key={gen.id} marginLeft={1}>
											<Text
												color={isSelected ? "magenta" : undefined}
												bold={isSelected}
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
								<Box marginTop={1} marginLeft={1}>
									<Text dimColor>
										+{generations.length - 8} more in gallery
									</Text>
								</Box>
							)}
						</>
					) : (
						<>
							<Text dimColor>
								Enter path or drag file
								{generations.length > 0 ? " (tab for history)" : ""}
							</Text>
							<Box marginTop={1}>
								<Text color="magenta">◆ </Text>
								<TextInput
									value={customPath}
									onChange={setCustomPath}
									onSubmit={proceedFromSelect}
									placeholder="/path/to/image.png"
								/>
							</Box>
						</>
					)}
				</Box>
			)}

			{/* Operation selection step */}
			{step === "operation" && source && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Source: {basename(source.output)}</Text>
					<Box marginTop={1} flexDirection="column">
						{OPERATIONS.map((op, index) => {
							const isSelected = index === operationIndex;
							return (
								<Box key={op.key} marginLeft={1}>
									<Box width={20}>
										<Text
											color={isSelected ? "magenta" : undefined}
											bold={isSelected}
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
				<Box marginTop={1} marginBottom={1}>
					<Text dimColor>Source: {basename(source.output)}</Text>
				</Box>
			)}

			{/* Edit model selection */}
			{step === "edit-model" && (
				<Box flexDirection="column">
					<Text>Select model for editing:</Text>
					<Box marginTop={1} flexDirection="column">
						{EDIT_MODELS.map((m, i) => (
							<Box key={m}>
								<Box width={22}>
									<Text
										color={i === editModelIndex ? "magenta" : undefined}
										bold={i === editModelIndex}
									>
										{i === editModelIndex ? "◆ " : "  "}
										{MODELS[m].name}
									</Text>
								</Box>
								<Text dimColor>{MODELS[m].pricing}</Text>
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
							value={prompt}
							onChange={setPrompt}
							onSubmit={handlePromptSubmit}
							placeholder="Change the background to a beach..."
						/>
					</Box>
				</Box>
			)}

			{/* Scale selection for upscale */}
			{step === "scale" && (
				<Box flexDirection="column">
					<Text>Select upscale factor:</Text>
					<Box marginTop={1}>
						<Text color="magenta" bold>
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
					<Box marginTop={1} flexDirection="column" marginLeft={2}>
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
						<Text>
							Seed: <Text color="cyan">{seed ?? "random"}</Text>
							{step === "confirm" && (
								<Text dimColor> (type digits to set)</Text>
							)}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text>Proceed? </Text>
						<Text color="green" bold>
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
					<Text color="green" bold>
						◆ Complete
					</Text>
					<Box marginTop={1} flexDirection="column" marginLeft={2}>
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
