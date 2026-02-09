import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import type { FalconConfig, History } from "../utils/config";
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

	useInput((input, key) => {
		if (input === "q" && screen === "home") {
			exit();
		}
		if (key.escape && screen !== "home") {
			setScreen("home");
		}
	});

	const handleError = (err: Error) => {
		setError(err.message);
		setTimeout(() => setError(null), 5000);
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
						onComplete={(nextScreen?: Screen) => {
							onHistoryChange();
							if (nextScreen === "edit") {
								setEditFromGenerate(true);
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
						onBack={() => {
							setEditFromGenerate(false);
							setScreen("home");
						}}
						onComplete={() => {
							setEditFromGenerate(false);
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
					${history.totalCost.session.toFixed(2)} session │ $
					{history.totalCost.today.toFixed(2)} today │ $
					{history.totalCost.allTime.toFixed(2)} total
				</Text>
			</Box>
		</Box>
	);
}
