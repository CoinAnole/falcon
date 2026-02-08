import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
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
	onSave: (config: Partial<FalconConfig>) => Promise<void>;
	onBack: () => void;
}

export function SettingsScreen({
	config,
	onSave,
	onBack,
}: SettingsScreenProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [editing, setEditing] = useState(false);
	const [editValue, setEditValue] = useState("");
	const [localConfig, setLocalConfig] = useState<FalconConfig>({ ...config });

	const currentSetting = SETTINGS[selectedIndex];

	useInput((input, key) => {
		if (key.escape) {
			if (editing) {
				setEditing(false);
			} else {
				onBack();
			}
			return;
		}

		if (editing) {
			return; // Let TextInput handle input
		}

		if (key.upArrow) {
			setSelectedIndex((i) => (i > 0 ? i - 1 : SETTINGS.length - 1));
		}

		if (key.downArrow) {
			setSelectedIndex((i) => (i < SETTINGS.length - 1 ? i + 1 : 0));
		}

		if (key.return) {
			const setting = SETTINGS[selectedIndex];
			if (setting.type === "toggle") {
				// Toggle boolean value
				setLocalConfig((c) => ({
					...c,
					[setting.key]: !c[setting.key],
				}));
			} else if (setting.type === "text") {
				setEditValue((localConfig[setting.key] as string) || "");
				setEditing(true);
			} else if (setting.type === "select" && setting.options) {
				// Cycle through options
				const currentValue = localConfig[setting.key] as string;
				const currentIdx = setting.options.indexOf(currentValue);
				const nextIdx = (currentIdx + 1) % setting.options.length;
				setLocalConfig((c) => ({
					...c,
					[setting.key]: setting.options?.[nextIdx],
				}));
			}
		}

		if (input === "s") {
			// Save settings
			onSave(localConfig);
		}
	});

	const handleTextSubmit = (value: string) => {
		setLocalConfig((c) => ({
			...c,
			[currentSetting.key]: value,
		}));
		setEditing(false);
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

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>Settings</Text>
				<Text dimColor> (Enter to edit, S to save)</Text>
			</Box>

			{SETTINGS.map((setting, index) => {
				const isSelected = index === selectedIndex;
				const isEditing = editing && isSelected;

				return (
					<Box key={setting.key} marginLeft={1}>
						<Text color={isSelected ? "magenta" : undefined} bold={isSelected}>
							{isSelected ? "◆ " : "  "}
							{setting.label.padEnd(20)}
						</Text>
						{isEditing && setting.type === "text" ? (
							<TextInput
								value={editValue}
								onChange={setEditValue}
								onSubmit={handleTextSubmit}
								mask="*"
							/>
						) : (
							<Text color={isSelected ? "green" : "gray"}>
								{formatValue(setting)}
							</Text>
						)}
					</Box>
				);
			})}

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>────────────────────────────</Text>
				<Box marginTop={1}>
					<Text dimColor>enter toggle/edit │ s save │ esc cancel</Text>
				</Box>
			</Box>
		</Box>
	);
}
