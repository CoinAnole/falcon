import { resolve } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { generate } from "../../api/fal";
import {
	type AspectRatio,
	estimateCost,
	GENERATION_MODELS,
	getAspectRatiosForModel,
	MODELS,
	RESOLUTIONS,
	type Resolution,
} from "../../api/models";
import {
	addGeneration,
	type FalconConfig,
	generateId,
} from "../../utils/config";
import {
	downloadImage,
	generateFilename,
	getFileSize,
	getImageDimensions,
	openImage,
} from "../../utils/image";
import { Spinner } from "../components/Spinner";

type Step =
	| "prompt"
	| "preset"
	| "model"
	| "aspect"
	| "resolution"
	| "confirm"
	| "generating"
	| "done";

type ConfirmField = "model" | "aspect" | "resolution";

interface Preset {
	key: string;
	label: string;
	description: string;
	aspect: AspectRatio;
	resolution?: Resolution;
}

const PRESETS: Preset[] = [
	{ key: "square", label: "Square", description: "1:1", aspect: "1:1" },
	{ key: "landscape", label: "Landscape", description: "16:9", aspect: "16:9" },
	{ key: "portrait", label: "Portrait", description: "2:3", aspect: "2:3" },
	{
		key: "story",
		label: "Story/Reel",
		description: "9:16 vertical",
		aspect: "9:16",
	},
	{
		key: "wide",
		label: "Cinematic",
		description: "21:9 ultra-wide",
		aspect: "21:9",
	},
	{
		key: "cover",
		label: "Book Cover",
		description: "2:3 @ 2K",
		aspect: "2:3",
		resolution: "2K",
	},
	{
		key: "og",
		label: "Social Share",
		description: "16:9 OG image",
		aspect: "16:9",
	},
];

type PostAction =
	| "edit"
	| "variations"
	| "upscale"
	| "rmbg"
	| "regenerate"
	| "new"
	| "home";

const POST_ACTIONS: { key: PostAction; label: string; description: string }[] =
	[
		{ key: "edit", label: "Edit", description: "Modify with a new prompt" },
		{
			key: "variations",
			label: "Variations",
			description: "Generate similar images",
		},
		{ key: "upscale", label: "Upscale", description: "Enhance resolution" },
		{ key: "rmbg", label: "Remove Background", description: "Transparent PNG" },
		{
			key: "regenerate",
			label: "Regenerate",
			description: "Same prompt, pick model",
		},
		{ key: "new", label: "New Prompt", description: "Start fresh" },
		{ key: "home", label: "Done", description: "Back to home" },
	];

interface GenerateScreenProps {
	config: FalconConfig;
	onBack: () => void;
	onComplete: (nextScreen?: "home" | "edit" | "generate") => void;
	onError: (err: Error) => void;
}

export function GenerateScreen({
	config,
	onBack,
	onComplete,
	onError,
}: GenerateScreenProps) {
	const [step, setStep] = useState<Step>("prompt");
	const [prompt, setPrompt] = useState("");
	const [model, setModel] = useState(config.defaultModel);
	const [aspect, setAspect] = useState<AspectRatio>(config.defaultAspect);
	const [resolution, setResolution] = useState<Resolution>(
		config.defaultResolution,
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [confirmField, setConfirmField] = useState<ConfirmField | null>(null);
	const [confirmIndex, setConfirmIndex] = useState(0);
	const [status, setStatus] = useState("");
	const [result, setResult] = useState<{
		path: string;
		dims: string;
		size: string;
	} | null>(null);

	const modelConfig = MODELS[model];
	const cost = estimateCost(model, resolution);

	useInput((input, key) => {
		if (key.escape) {
			if (step === "generating") return;
			if (step === "confirm" && confirmField) {
				setConfirmField(null);
				setSelectedIndex(0);
				return;
			}
			if (step === "prompt") {
				onBack();
			} else if (step === "done") {
				onComplete();
			} else if (step === "preset") {
				setStep("prompt");
			} else if (step === "model") {
				setStep("preset");
				setSelectedIndex(0);
			} else if (step === "confirm") {
				setStep("preset");
				setSelectedIndex(0);
			} else {
				// Go back a step
				const steps: Step[] = [
					"prompt",
					"preset",
					"model",
					"aspect",
					"resolution",
					"confirm",
				];
				const currentIdx = steps.indexOf(step);
				if (currentIdx > 0) {
					setStep(steps[currentIdx - 1]);
					setSelectedIndex(0);
				}
			}
			return;
		}

		if (step === "preset") {
			if (key.upArrow && selectedIndex > 0) {
				setSelectedIndex(selectedIndex - 1);
			} else if (key.downArrow && selectedIndex < PRESETS.length - 1) {
				setSelectedIndex(selectedIndex + 1);
			} else if (key.return) {
				// Apply preset and go to confirm
				const preset = PRESETS[selectedIndex];
				setAspect(preset.aspect);
				if (preset.resolution) {
					setResolution(preset.resolution);
				}
				setSelectedIndex(0);
				setConfirmIndex(0);
				setConfirmField(null);
				setStep("confirm");
			} else if (key.tab) {
				// Skip to manual model selection
				setSelectedIndex(0);
				setStep("model");
			}
		} else if (step === "model") {
			handleListNavigation(
				GENERATION_MODELS,
				(m) => {
					setModel(m);
					setConfirmIndex(0);
					setConfirmField(null);
					setStep(modelConfig?.supportsAspect ? "aspect" : "confirm");
				},
				key,
				input,
			);
		} else if (step === "aspect") {
			// Grid navigation: dynamic columns based on aspect ratio count
			const aspectRatios = getAspectRatiosForModel(model);
			const cols = aspectRatios.length > 10 ? 4 : 5;
			const total = aspectRatios.length;
			const row = Math.floor(selectedIndex / cols);
			const col = selectedIndex % cols;

			if (key.leftArrow) {
				setSelectedIndex((i) => (col > 0 ? i - 1 : i));
			} else if (key.rightArrow) {
				setSelectedIndex((i) => (col < cols - 1 && i < total - 1 ? i + 1 : i));
			} else if (key.upArrow) {
				setSelectedIndex((i) => (row > 0 ? i - cols : i));
			} else if (key.downArrow) {
				const newIndex = selectedIndex + cols;
				if (newIndex < total) setSelectedIndex(newIndex);
			} else if (key.return) {
				setAspect(aspectRatios[selectedIndex] as AspectRatio);
				setSelectedIndex(0);
				setConfirmIndex(0);
				setConfirmField(null);
				setStep(modelConfig?.supportsResolution ? "resolution" : "confirm");
			}
		} else if (step === "resolution") {
			handleListNavigation(
				RESOLUTIONS,
				(r) => {
					setResolution(r as Resolution);
					setConfirmIndex(0);
					setConfirmField(null);
					setStep("confirm");
				},
				key,
				input,
			);
		} else if (step === "confirm") {
			if (confirmField) {
				// Editing a field inline
				if (key.escape) {
					setConfirmField(null);
					setSelectedIndex(0);
				} else if (confirmField === "model") {
					handleListNavigation(
						GENERATION_MODELS,
						(m) => {
							setModel(m);
							setConfirmField(null);
							setSelectedIndex(0);
						},
						key,
						input,
					);
				} else if (confirmField === "aspect") {
					const aspectRatios = getAspectRatiosForModel(model);
					handleListNavigation(
						aspectRatios as readonly string[],
						(a) => {
							setAspect(a as AspectRatio);
							setConfirmField(null);
							setSelectedIndex(0);
						},
						key,
						input,
					);
				} else if (confirmField === "resolution") {
					handleListNavigation(
						RESOLUTIONS,
						(r) => {
							setResolution(r as Resolution);
							setConfirmField(null);
							setSelectedIndex(0);
						},
						key,
						input,
					);
				}
			} else {
				// Navigating confirm fields
				const fields: ConfirmField[] = MODELS[model]?.supportsResolution
					? ["model", "aspect", "resolution"]
					: ["model", "aspect"];

				if (key.upArrow) {
					setConfirmIndex((i) => (i > 0 ? i - 1 : fields.length - 1));
				} else if (key.downArrow) {
					setConfirmIndex((i) => (i < fields.length - 1 ? i + 1 : 0));
				} else if (key.return) {
					// Edit the selected field
					const field = fields[confirmIndex];
					setConfirmField(field);
					// Set selectedIndex to current value
					if (field === "model") {
						setSelectedIndex(GENERATION_MODELS.indexOf(model));
					} else if (field === "aspect") {
						setSelectedIndex(getAspectRatiosForModel(model).indexOf(aspect));
					} else if (field === "resolution") {
						setSelectedIndex(RESOLUTIONS.indexOf(resolution));
					}
				} else if (input === "y") {
					runGeneration();
				} else if (input === "n") {
					onBack();
				}
			}
		} else if (step === "done") {
			if (key.upArrow) {
				setSelectedIndex((i) => (i > 0 ? i - 1 : POST_ACTIONS.length - 1));
			} else if (key.downArrow) {
				setSelectedIndex((i) => (i < POST_ACTIONS.length - 1 ? i + 1 : 0));
			} else if (key.return) {
				const action = POST_ACTIONS[selectedIndex].key;
				switch (action) {
					case "edit":
					case "variations":
					case "upscale":
					case "rmbg":
						onComplete("edit");
						break;
					case "regenerate":
						// Reset to model selection with same prompt
						setStep("model");
						setSelectedIndex(0);
						break;
					case "new":
						// Start fresh
						setPrompt("");
						setResult(null);
						setStep("prompt");
						setSelectedIndex(0);
						break;
					case "home":
						onComplete("home");
						break;
				}
			}
		}
	});

	const handleListNavigation = <T extends string>(
		items: readonly T[],
		onSelect: (item: T) => void,
		key: { upArrow?: boolean; downArrow?: boolean; return?: boolean },
		_input: string,
	) => {
		if (key.upArrow) {
			setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
		} else if (key.return) {
			onSelect(items[selectedIndex]);
			setSelectedIndex(0);
		}
	};

	const runGeneration = async () => {
		setStep("generating");
		setStatus("Generating...");

		try {
			const result = await generate({
				prompt,
				model,
				aspect,
				resolution,
				numImages: 1,
			});

			setStatus("Downloading...");
			const outputPath = generateFilename();
			await downloadImage(result.images[0].url, outputPath);

			const dims = await getImageDimensions(outputPath);
			const size = await getFileSize(outputPath);

			// Record generation
			await addGeneration({
				id: generateId(),
				prompt,
				model,
				aspect,
				resolution,
				output: resolve(outputPath),
				cost,
				timestamp: new Date().toISOString(),
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

			setSelectedIndex(0);
			setStep("done");
		} catch (err) {
			onError(err as Error);
			onBack();
		}
	};

	const handlePromptSubmit = (value: string) => {
		if (value.trim()) {
			setPrompt(value.trim());
			setSelectedIndex(0);
			setStep("preset");
		}
	};

	return (
		<Box flexDirection="column">
			{/* Prompt input */}
			{step === "prompt" && (
				<Box flexDirection="column">
					<Text bold>Enter your prompt:</Text>
					<Box marginTop={1}>
						<Text color="magenta">◆ </Text>
						<TextInput
							value={prompt}
							onChange={setPrompt}
							onSubmit={handlePromptSubmit}
							placeholder="A cat sitting on a windowsill..."
						/>
					</Box>
				</Box>
			)}

			{/* Preset selection */}
			{step === "preset" && (
				<Box flexDirection="column">
					<Text bold>Quick presets</Text>
					<Text dimColor>↑↓ select, enter apply, tab for manual</Text>
					<Box marginTop={1} flexDirection="column">
						{PRESETS.map((preset, i) => (
							<Box key={preset.key} marginLeft={1}>
								<Text
									color={i === selectedIndex ? "magenta" : undefined}
									bold={i === selectedIndex}
								>
									{i === selectedIndex ? "◆ " : "  "}
									{preset.label.padEnd(14)}
								</Text>
								<Text dimColor={i !== selectedIndex}>{preset.description}</Text>
							</Box>
						))}
					</Box>
				</Box>
			)}

			{/* Model selection */}
			{step === "model" && (
				<Box flexDirection="column">
					<Text bold>Select model:</Text>
					<Box marginTop={1} flexDirection="column">
						{GENERATION_MODELS.map((m, i) => (
							<Box key={m}>
								<Text
									color={i === selectedIndex ? "magenta" : undefined}
									bold={i === selectedIndex}
								>
									{i === selectedIndex ? "◆ " : "  "}
									{MODELS[m].name.padEnd(20)}
								</Text>
								<Text dimColor>{MODELS[m].pricing}</Text>
							</Box>
						))}
					</Box>
				</Box>
			)}

			{/* Aspect ratio selection - dynamic grid */}
			{step === "aspect" && (
				<Box flexDirection="column">
					<Text bold>Select aspect ratio:</Text>
					<Text dimColor>↑↓←→ to navigate</Text>
					<Box marginTop={1} flexDirection="column">
						{(() => {
							const aspectRatios = getAspectRatiosForModel(model);
							const cols = aspectRatios.length > 10 ? 4 : 5;
							const rows = Math.ceil(aspectRatios.length / cols);
							return Array.from({ length: rows }, (_, row) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: Row index is stable for static grid layout
								<Box key={`row-${row}`} flexDirection="row">
									{aspectRatios
										.slice(row * cols, row * cols + cols)
										.map((a: AspectRatio, colIdx: number) => {
											const i = row * cols + colIdx;
											return (
												<Box key={a} width={12}>
													<Text
														color={i === selectedIndex ? "magenta" : undefined}
														bold={i === selectedIndex}
													>
														{i === selectedIndex ? "◆" : " "}
														{a.padEnd(6)}
													</Text>
												</Box>
											);
										})}
								</Box>
							));
						})()}
					</Box>
				</Box>
			)}

			{/* Resolution selection */}
			{step === "resolution" && (
				<Box flexDirection="column">
					<Text bold>Select resolution:</Text>
					<Box marginTop={1} flexDirection="column">
						{RESOLUTIONS.map((r, i) => (
							<Box key={r}>
								<Text
									color={i === selectedIndex ? "magenta" : undefined}
									bold={i === selectedIndex}
								>
									{i === selectedIndex ? "◆ " : "  "}
									{r}
								</Text>
							</Box>
						))}
					</Box>
				</Box>
			)}

			{/* Confirmation */}
			{step === "confirm" && (
				<Box flexDirection="column">
					<Text bold>Ready to generate:</Text>
					{confirmField && <Text dimColor>esc cancel</Text>}
					<Box marginTop={1} flexDirection="column" marginLeft={2}>
						<Text>
							Prompt:{" "}
							<Text color="cyan">
								{prompt.slice(0, 50)}
								{prompt.length > 50 ? "..." : ""}
							</Text>
						</Text>
						{confirmField === "model" ? (
							<Box flexDirection="column">
								{GENERATION_MODELS.map((m, i) => (
									<Box key={m}>
										<Text
											color={i === selectedIndex ? "magenta" : undefined}
											bold={i === selectedIndex}
										>
											{i === selectedIndex ? "◆ " : "  "}
											{MODELS[m].name}
										</Text>
									</Box>
								))}
							</Box>
						) : (
							<Text>
								{confirmIndex === 0 && !confirmField ? "◆ " : "  "}
								Model:{" "}
								<Text
									color={
										confirmIndex === 0 && !confirmField ? "magenta" : "green"
									}
								>
									{MODELS[model].name}
								</Text>
							</Text>
						)}
						{confirmField === "aspect" ? (
							<Box flexDirection="column">
								{getAspectRatiosForModel(model).map(
									(a: AspectRatio, i: number) => (
										<Box key={a}>
											<Text
												color={i === selectedIndex ? "magenta" : undefined}
												bold={i === selectedIndex}
											>
												{i === selectedIndex ? "◆ " : "  "}
												{a}
											</Text>
										</Box>
									),
								)}
							</Box>
						) : (
							<Text>
								{confirmIndex === 1 && !confirmField ? "◆ " : "  "}
								Aspect:{" "}
								<Text
									color={
										confirmIndex === 1 && !confirmField ? "magenta" : undefined
									}
								>
									{aspect}
								</Text>
							</Text>
						)}
						{modelConfig?.supportsResolution &&
							(confirmField === "resolution" ? (
								<Box flexDirection="column">
									{RESOLUTIONS.map((r, i) => (
										<Box key={r}>
											<Text
												color={i === selectedIndex ? "magenta" : undefined}
												bold={i === selectedIndex}
											>
												{i === selectedIndex ? "◆ " : "  "}
												{r}
											</Text>
										</Box>
									))}
								</Box>
							) : (
								<Text>
									{confirmIndex === 2 && !confirmField ? "◆ " : "  "}
									Resolution:{" "}
									<Text
										color={
											confirmIndex === 2 && !confirmField
												? "magenta"
												: undefined
										}
									>
										{resolution}
									</Text>
								</Text>
							))}
						<Text>
							{"  "}Est. cost: <Text color="yellow">${cost.toFixed(3)}</Text>
						</Text>
					</Box>
					{!confirmField && (
						<Box marginTop={1} flexDirection="column">
							<Text dimColor>↑↓ select, enter to edit</Text>
							<Box>
								<Text>Generate? </Text>
								<Text color="green" bold>
									[Y]es
								</Text>
								<Text> / </Text>
								<Text color="red">[N]o</Text>
							</Box>
						</Box>
					)}
				</Box>
			)}

			{/* Generating */}
			{step === "generating" && (
				<Box>
					<Spinner text={status} />
				</Box>
			)}

			{/* Done - show post-generation menu */}
			{step === "done" && result && (
				<Box flexDirection="column">
					<Text color="green" bold>
						◆ Image ready
					</Text>
					<Box marginTop={1} flexDirection="column" marginLeft={2}>
						<Text>
							Saved: <Text color="cyan">{result.path}</Text>
						</Text>
						<Text dimColor>
							{result.dims} · {result.size}
						</Text>
					</Box>

					<Box marginTop={1} flexDirection="column">
						<Text bold>Continue</Text>
						{POST_ACTIONS.map((action, i) => (
							<Box key={action.key} marginLeft={1}>
								<Box width={20}>
									<Text
										color={i === selectedIndex ? "magenta" : undefined}
										bold={i === selectedIndex}
									>
										{i === selectedIndex ? "◆ " : "  "}
										{action.label}
									</Text>
								</Box>
								<Text dimColor={i !== selectedIndex}>{action.description}</Text>
							</Box>
						))}
					</Box>
				</Box>
			)}
		</Box>
	);
}
