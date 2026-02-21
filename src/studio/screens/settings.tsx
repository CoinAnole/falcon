import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useRef, useState } from "react";
import {
	ASPECT_RATIOS,
	GENERATION_MODELS,
	MODELS,
	RESOLUTIONS,
} from "../../api/models";
import type { FalconConfig } from "../../utils/config";

interface SettingItem {
	key: keyof FalconConfig;
	label: string;
	type: "select" | "toggle" | "text";
	options?: readonly string[];
}

const SETTINGS: SettingItem[] = [
	{
		key: "defaultModel",
		label: "Default Model",
		type: "select",
		options: GENERATION_MODELS,
	},
	{
		key: "defaultAspect",
		label: "Default Aspect",
		type: "select",
		options: ASPECT_RATIOS,
	},
	{
		key: "defaultResolution",
		label: "Default Resolution",
		type: "select",
		options: RESOLUTIONS,
	},
	{
		key: "upscaler",
		label: "Upscaler",
		type: "select",
		options: ["clarity", "crystal"],
	},
	{
		key: "backgroundRemover",
		label: "Background Remover",
		type: "select",
		options: ["rmbg", "bria"],
	},
	{ key: "openAfterGenerate", label: "Open After Generate", type: "toggle" },
	{
		key: "promptExpansion",
		label: "Prompt Expansion (Flux 2)",
		type: "toggle",
	},
	{ key: "apiKey", label: "API Key", type: "text" },
];

interface SettingsScreenProps {
	config: FalconConfig;
	onPersistChange: (config: Partial<FalconConfig>) => Promise<void>;
	onBack: () => void;
	onQuit?: () => void;
}

type SettingsStep = "list" | "editSelect" | "editToggle" | "editText";
type SaveStatusType = "idle" | "saving" | "saved" | "error";

interface SaveStatus {
	type: SaveStatusType;
	message?: string;
}

const STATUS_HIDE_DELAY_MS = 1800;

export function SettingsScreen({
	config,
	onPersistChange,
	onBack,
	onQuit = () => undefined,
}: SettingsScreenProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [step, setStep] = useState<SettingsStep>("list");
	const [editorIndex, setEditorIndex] = useState(0);
	const [editValue, setEditValue] = useState("");
	const [localConfig, setLocalConfig] = useState<FalconConfig>({ ...config });
	const [status, setStatus] = useState<SaveStatus>({ type: "idle" });
	const saveSeqRef = useRef(0);
	const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const currentSetting = SETTINGS[selectedIndex];

	useEffect(() => {
		return () => {
			if (statusTimerRef.current) {
				clearTimeout(statusTimerRef.current);
			}
		};
	}, []);

	const clearStatusTimer = () => {
		if (statusTimerRef.current) {
			clearTimeout(statusTimerRef.current);
			statusTimerRef.current = null;
		}
	};

	const setTransientStatus = (nextStatus: SaveStatus, durationMs = 1800) => {
		clearStatusTimer();
		setStatus(nextStatus);
		if (durationMs > 0) {
			statusTimerRef.current = setTimeout(() => {
				setStatus({ type: "idle" });
			}, durationMs);
		}
	};

	const persistPatch = async (patch: Partial<FalconConfig>) => {
		setLocalConfig((current) => ({
			...current,
			...patch,
		}));
		clearStatusTimer();
		setStatus({ type: "saving", message: "Saving..." });
		const sequence = ++saveSeqRef.current;
		try {
			await onPersistChange(patch);
			if (sequence !== saveSeqRef.current) {
				return;
			}
			setTransientStatus(
				{ type: "saved", message: "Saved" },
				STATUS_HIDE_DELAY_MS
			);
		} catch {
			if (sequence !== saveSeqRef.current) {
				return;
			}
			clearStatusTimer();
			setStatus({
				type: "error",
				message: "Save failed. Change is kept locally; try again.",
			});
		}
	};

	const enterEditor = () => {
		const setting = currentSetting;
		if (setting.type === "text") {
			setEditValue((localConfig[setting.key] as string) || "");
			setStep("editText");
			return;
		}

		if (setting.type === "toggle") {
			setEditorIndex(localConfig[setting.key] ? 1 : 0);
			setStep("editToggle");
			return;
		}

		const options = setting.options ?? [];
		const currentValue = localConfig[setting.key] as string;
		const currentIdx = options.indexOf(currentValue);
		setEditorIndex(currentIdx >= 0 ? currentIdx : 0);
		setStep("editSelect");
	};

	const handleEscapeInput = () => {
		if (step === "list") {
			onBack();
			return;
		}
		if (step === "editText") {
			setEditValue((localConfig[currentSetting.key] as string) || "");
		}
		setStep("list");
	};

	const handleListInput = (
		input: string,
		key: { upArrow?: boolean; downArrow?: boolean; return?: boolean }
	) => {
		if (input === "q") {
			onQuit();
			return;
		}

		if (key.upArrow) {
			setSelectedIndex((index) =>
				index > 0 ? index - 1 : SETTINGS.length - 1
			);
			return;
		}

		if (key.downArrow) {
			setSelectedIndex((index) =>
				index < SETTINGS.length - 1 ? index + 1 : 0
			);
			return;
		}

		if (key.return) {
			enterEditor();
		}
	};

	const handleSelectEditorInput = (key: {
		upArrow?: boolean;
		downArrow?: boolean;
		return?: boolean;
	}) => {
		const setting = currentSetting;
		if (
			setting.type !== "select" ||
			!setting.options ||
			setting.options.length === 0
		) {
			return;
		}

		if (!(key.upArrow || key.downArrow || key.return)) {
			return;
		}

		const options = setting.options;
		if (key.return) {
			setStep("list");
			const nextValue = options[editorIndex];
			const currentValue = localConfig[setting.key] as string;
			if (currentValue === nextValue) {
				return;
			}
			persistPatch({
				[setting.key]: nextValue,
			} as Partial<FalconConfig>).catch(() => {
				// Error handled in persistPatch
			});
			return;
		}

		if (key.upArrow) {
			setEditorIndex((index) => (index > 0 ? index - 1 : options.length - 1));
			return;
		}

		setEditorIndex((index) => (index < options.length - 1 ? index + 1 : 0));
	};

	const handleToggleEditorInput = (key: {
		upArrow?: boolean;
		downArrow?: boolean;
		return?: boolean;
	}) => {
		if (!(key.upArrow || key.downArrow || key.return)) {
			return;
		}

		const setting = currentSetting;
		if (setting.type !== "toggle") {
			return;
		}

		if (key.return) {
			setStep("list");
			const nextValue = editorIndex === 1;
			if (Boolean(localConfig[setting.key]) === nextValue) {
				return;
			}
			persistPatch({
				[setting.key]: nextValue,
			} as Partial<FalconConfig>).catch(() => {
				// Error handled in persistPatch
			});
			return;
		}

		setEditorIndex((index) => (index === 0 ? 1 : 0));
	};

	const handleTextEditorInput = () => {
		// TextInput handles character input and submission.
	};

	useInput((input, key) => {
		if (key.escape) {
			handleEscapeInput();
			return;
		}

		if (step === "list") {
			handleListInput(input, key);
			return;
		}

		if (step === "editSelect") {
			handleSelectEditorInput(key);
			return;
		}

		if (step === "editToggle") {
			handleToggleEditorInput(key);
			return;
		}

		handleTextEditorInput();
	});

	const handleTextSubmit = (value: string) => {
		if (currentSetting.type !== "text") {
			return;
		}
		setStep("list");
		persistPatch({
			[currentSetting.key]: value,
		} as Partial<FalconConfig>).catch(() => {
			// Error handled in persistPatch
		});
	};

	const formatValue = (setting: SettingItem): string => {
		const value = localConfig[setting.key];
		if (setting.type === "toggle") {
			return value ? "Yes" : "No";
		}
		if (setting.key === "apiKey" && value) {
			const str = value as string;
			return `${str.slice(0, 8)}...${str.slice(-4)}`;
		}
		if (setting.key === "defaultModel" && value) {
			return MODELS[value as string]?.name || (value as string);
		}
		return String(value || "Not set");
	};

	const formatOptionValue = (setting: SettingItem, value: string): string => {
		if (setting.key === "defaultModel") {
			return MODELS[value]?.name || value;
		}
		return value;
	};

	const renderEditor = () => {
		if (step === "list") {
			return null;
		}

		if (step === "editSelect" && currentSetting.type === "select") {
			const options = currentSetting.options ?? [];
			return (
				<Box flexDirection="column" marginTop={1} paddingLeft={1}>
					<Text dimColor>Editing {currentSetting.label}</Text>
					<Box flexDirection="column" marginTop={1}>
						{options.map((option, index) => (
							<Text
								bold={index === editorIndex}
								color={index === editorIndex ? "magenta" : undefined}
								key={option}
							>
								{index === editorIndex ? "◆ " : "  "}
								{formatOptionValue(currentSetting, option)}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		if (step === "editToggle" && currentSetting.type === "toggle") {
			const options: Array<{ label: string; index: number }> = [
				{ label: "No", index: 0 },
				{ label: "Yes", index: 1 },
			];
			return (
				<Box flexDirection="column" marginTop={1} paddingLeft={1}>
					<Text dimColor>Editing {currentSetting.label}</Text>
					<Box flexDirection="column" marginTop={1}>
						{options.map((option) => (
							<Text
								bold={option.index === editorIndex}
								color={option.index === editorIndex ? "magenta" : undefined}
								key={option.label}
							>
								{option.index === editorIndex ? "◆ " : "  "}
								{option.label}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		if (step === "editText" && currentSetting.type === "text") {
			return (
				<Box flexDirection="column" marginTop={1} paddingLeft={1}>
					<Text dimColor>Editing {currentSetting.label}</Text>
					<Box marginTop={1}>
						<Text color="magenta">◆ </Text>
						<TextInput
							mask="*"
							onChange={setEditValue}
							onSubmit={handleTextSubmit}
							value={editValue}
						/>
					</Box>
				</Box>
			);
		}

		return null;
	};

	const getStatusColor = (): string | undefined => {
		if (status.type === "saved") {
			return "green";
		}
		if (status.type === "saving") {
			return "yellow";
		}
		if (status.type === "error") {
			return "red";
		}
		return undefined;
	};

	const statusColor = getStatusColor();

	const getLegend = (): string => {
		if (step === "list") {
			return "enter edit │ esc back │ q quit";
		}
		if (step === "editText") {
			return "enter save │ esc cancel";
		}
		return "↑↓ change │ enter save │ esc cancel";
	};

	const legend = getLegend();

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>Settings</Text>
				<Text dimColor> (Press Enter to save changes)</Text>
			</Box>

			{SETTINGS.map((setting, index) => {
				const isSelected = index === selectedIndex;

				return (
					<Box key={setting.key} marginLeft={1}>
						<Box width={28}>
							<Text
								bold={isSelected}
								color={isSelected ? "magenta" : undefined}
							>
								{isSelected ? "◆ " : "  "}
								{setting.label}
							</Text>
						</Box>
						<Text color={isSelected ? "green" : "gray"}>
							{formatValue(setting)}
						</Text>
					</Box>
				);
			})}

			{renderEditor()}

			<Box flexDirection="column" marginTop={2}>
				<Text dimColor>────────────────────────────</Text>
				<Box marginTop={1}>
					<Text dimColor>{legend}</Text>
				</Box>
				{status.type !== "idle" && (
					<Box marginTop={1}>
						<Text color={statusColor}>{status.message}</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
}
