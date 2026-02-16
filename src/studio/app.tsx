import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import type { FalconConfig, History } from "./deps/config";
import { logger } from "./deps/logger";
import { EditScreen } from "./screens/edit";
import { GalleryScreen } from "./screens/gallery";
import { GenerateScreen } from "./screens/generate";
import { HomeScreen } from "./screens/home";
import { SettingsScreen } from "./screens/settings";

export type Screen = "home" | "generate" | "gallery" | "settings" | "edit";

interface AppProps {
	config: FalconConfig;
	history: History;
	onConfigChange: (config: Partial<FalconConfig>) => Promise<void>;
	onHistoryChange: () => Promise<void>;
}

export function App({
	config,
	history,
	onConfigChange,
	onHistoryChange,
}: AppProps) {
	const { exit } = useApp();
	const [screen, setScreen] = useState<Screen>("home");
	const [error, setError] = useState<string | null>(null);
	const [editFromGenerate, setEditFromGenerate] = useState(false);
	const [editInitialOperation, setEditInitialOperation] = useState<
		"edit" | "variations" | "upscale" | "rmbg" | undefined
	>(undefined);
	const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clean up error timeout on unmount
	useEffect(() => {
		return () => {
			if (errorTimeoutRef.current) {
				clearTimeout(errorTimeoutRef.current);
			}
		};
	}, []);

	useInput((input, key) => {
		if (input === "q" && screen === "home") {
			exit();
		}
		if (key.escape && screen !== "home") {
			setScreen("home");
		}
	});

	const handleError = (err: Error) => {
		// Clear any existing timeout
		if (errorTimeoutRef.current) {
			clearTimeout(errorTimeoutRef.current);
		}
		// Log error before displaying
		logger.errorWithStack("Studio error occurred", err, {
			screen,
			editFromGenerate,
		});
		setError(err.message);
		errorTimeoutRef.current = setTimeout(() => setError(null), 5000);
	};

	const renderScreen = () => {
		switch (screen) {
			case "home":
				return <HomeScreen history={history} onNavigate={setScreen} />;
			case "generate":
				return (
					<GenerateScreen
						config={config}
						onBack={() => setScreen("home")}
						onComplete={(
							nextScreen?: Screen,
							operation?: "edit" | "variations" | "upscale" | "rmbg"
						) => {
							onHistoryChange();
							if (nextScreen === "edit") {
								setEditFromGenerate(true);
								setEditInitialOperation(operation);
							}
							setScreen(nextScreen || "home");
						}}
						onError={handleError}
					/>
				);
			case "edit":
				return (
					<EditScreen
						config={config}
						initialOperation={editInitialOperation}
						onBack={() => {
							setEditFromGenerate(false);
							setEditInitialOperation(undefined);
							setScreen("home");
						}}
						onComplete={() => {
							setEditFromGenerate(false);
							setEditInitialOperation(undefined);
							onHistoryChange();
							setScreen("home");
						}}
						onError={handleError}
						skipToOperation={editFromGenerate}
					/>
				);
			case "gallery":
				return (
					<GalleryScreen history={history} onBack={() => setScreen("home")} />
				);
			case "settings":
				return (
					<SettingsScreen
						config={config}
						onBack={() => setScreen("home")}
						onSave={async (newConfig) => {
							await onConfigChange(newConfig);
							setScreen("home");
						}}
					/>
				);
			default:
				return <HomeScreen history={history} onNavigate={setScreen} />;
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="magenta">
					◆ falcon
				</Text>
				<Text dimColor>
					{" "}
					│{" "}
					{screen === "home"
						? "↑↓ navigate  enter select  q quit"
						: "esc back  q quit"}
				</Text>
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color="red">✗ {error}</Text>
				</Box>
			)}

			{renderScreen()}

			<Box marginTop={1}>
				<Text color="magenta">◆</Text>
				<Text dimColor>
					{" "}
					{Object.keys(history.totalCost).length > 0
						? (() => {
								const [currency] = Object.keys(history.totalCost);
								const totals = history.totalCost[currency];
								const extra = Object.keys(history.totalCost).length - 1;
								const suffix = extra > 0 ? ` (+${extra})` : "";
								return `${currency}${suffix} $${totals.session.toFixed(2)} session │ ${currency}${suffix} $${totals.today.toFixed(2)} today │ ${currency}${suffix} $${totals.allTime.toFixed(2)} total`;
							})()
						: "$0.00 session │ $0.00 today │ $0.00 total"}
				</Text>
			</Box>
		</Box>
	);
}
