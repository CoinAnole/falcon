import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { MODELS } from "../../api/models";
import type { History } from "../../utils/config";
import type { Screen } from "../app";

function getMenuItemColor(
	isDisabled: boolean,
	isSelected: boolean
): string | undefined {
	if (isDisabled) {
		return "gray";
	}
	if (isSelected) {
		return "magenta";
	}
	return undefined;
}

interface MenuItem {
	key: Screen;
	label: string;
	description: string;
	requiresLast?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
	{
		key: "generate",
		label: "Generate",
		description: "Create new image from prompt",
	},
	{
		key: "edit",
		label: "Edit",
		description: "Modify, upscale, or remove background",
	},
	{
		key: "gallery",
		label: "Gallery",
		description: "Browse generation history",
	},
	{
		key: "settings",
		label: "Settings",
		description: "Model, aspect, defaults",
	},
];

interface HomeScreenProps {
	history: History;
	onNavigate: (screen: Screen) => void;
}

export function HomeScreen({ history, onNavigate }: HomeScreenProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const hasLast = history.generations.length > 0;
	const last = history.generations[0];

	useInput((_input, key) => {
		if (key.upArrow) {
			setSelectedIndex((i) => (i > 0 ? i - 1 : MENU_ITEMS.length - 1));
		}
		if (key.downArrow) {
			setSelectedIndex((i) => (i < MENU_ITEMS.length - 1 ? i + 1 : 0));
		}
		if (key.return) {
			const item = MENU_ITEMS[selectedIndex];
			if (item.requiresLast && !hasLast) {
				return; // Can't select this item
			}
			onNavigate(item.key);
		}
	});

	return (
		<Box flexDirection="column">
			{MENU_ITEMS.map((item, index) => {
				const isSelected = index === selectedIndex;
				const isDisabled = Boolean(item.requiresLast && !hasLast);

				return (
					<Box key={item.key} marginLeft={1}>
						<Text
							bold={isSelected}
							color={getMenuItemColor(isDisabled, isSelected)}
							dimColor={isDisabled}
						>
							{isSelected ? "◆ " : "  "}
							{item.label.padEnd(14)}
						</Text>
						<Text dimColor={isDisabled || !isSelected}>{item.description}</Text>
					</Box>
				);
			})}

			{last && (
				<Box flexDirection="column" marginTop={1} paddingLeft={2}>
					<Box>
						<Text dimColor>────────────────────────────</Text>
					</Box>
					<Box marginTop={1}>
						<Text dimColor>Last </Text>
						<Text color="cyan">
							{last.prompt.slice(0, 40)}
							{last.prompt.length > 40 ? "..." : ""}
						</Text>
					</Box>
					<Box>
						<Text dimColor>
							{MODELS[last.model]?.name || last.model} · {last.aspect}
						</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}
