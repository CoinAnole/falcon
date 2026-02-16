import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { MODELS } from "../../api/models";
import type { History } from "../deps/config";
import { openImage } from "../deps/image";

interface GalleryScreenProps {
	history: History;
	onBack: () => void;
	onQuit?: () => void;
}

export function GalleryScreen({
	history,
	onBack,
	onQuit = () => undefined,
}: GalleryScreenProps) {
	const [selectedGlobalIndex, setSelectedGlobalIndex] = useState(0);
	const pageSize = 8;

	// Reverse to display newest-first (storage is oldest-first for O(1) push)
	const generations = [...history.generations].reverse();
	const totalItems = generations.length;
	const page = Math.floor(selectedGlobalIndex / pageSize);
	const totalPages = Math.ceil(generations.length / pageSize);
	const selectedIndex = selectedGlobalIndex - page * pageSize;
	const pageItems = generations.slice(page * pageSize, (page + 1) * pageSize);

	const handleUpArrow = () => {
		if (totalItems === 0) {
			return;
		}
		setSelectedGlobalIndex((index) => (index > 0 ? index - 1 : totalItems - 1));
	};

	const handleDownArrow = () => {
		if (totalItems === 0) {
			return;
		}
		setSelectedGlobalIndex((index) => (index < totalItems - 1 ? index + 1 : 0));
	};

	useInput((input, key) => {
		if (input === "q") {
			onQuit();
			return;
		}

		if (key.escape) {
			onBack();
			return;
		}

		if (key.upArrow) {
			handleUpArrow();
		}

		if (key.downArrow) {
			handleDownArrow();
		}

		if (key.leftArrow && page > 0) {
			setSelectedGlobalIndex((page - 1) * pageSize);
		}

		if (key.rightArrow && page < totalPages - 1) {
			setSelectedGlobalIndex((page + 1) * pageSize);
		}

		if (key.return && generations[selectedGlobalIndex]) {
			try {
				openImage(generations[selectedGlobalIndex].output);
			} catch {
				// Image may have been deleted; silently ignore
			}
		}
	});

	if (generations.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold>Gallery</Text>
				<Box marginTop={1}>
					<Text dimColor>No generations yet. Create your first image!</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>Gallery</Text>
				<Text dimColor> ({generations.length} images)</Text>
			</Box>

			{pageItems.map((gen, index) => {
				const isSelected = index === selectedIndex;
				const date = new Date(gen.timestamp);
				const timeStr =
					date.toLocaleDateString() +
					" " +
					date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

				return (
					<Box key={gen.id} marginLeft={1}>
						<Text bold={isSelected} color={isSelected ? "magenta" : undefined}>
							{isSelected ? "◆ " : "  "}
						</Text>
						<Box width={45}>
							<Text color={isSelected ? "cyan" : undefined}>
								{gen.prompt.slice(0, 35)}
								{gen.prompt.length > 35 ? "..." : ""}
							</Text>
						</Box>
						<Box width={18}>
							<Text dimColor>
								{MODELS[gen.model]?.name?.slice(0, 15) || gen.model}
							</Text>
						</Box>
						<Text dimColor>{timeStr}</Text>
					</Box>
				);
			})}

			{totalPages > 1 && (
				<Box marginTop={1}>
					<Text dimColor>
						Page {page + 1}/{totalPages} (←→ to navigate)
					</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>Enter: Open image | Esc: Back</Text>
			</Box>
		</Box>
	);
}
