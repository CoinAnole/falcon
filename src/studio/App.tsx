import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { HomeScreen } from "./screens/Home";
import { GenerateScreen } from "./screens/Generate";
import { GalleryScreen } from "./screens/Gallery";
import { SettingsScreen } from "./screens/Settings";
import { EditScreen } from "./screens/Edit";
import type { FalkyConfig, History } from "../utils/config";

export type Screen = "home" | "generate" | "gallery" | "settings" | "edit" | "upscale" | "rmbg" | "variations";

interface AppProps {
  config: FalkyConfig;
  history: History;
  onConfigChange: (config: Partial<FalkyConfig>) => Promise<void>;
  onHistoryChange: () => Promise<void>;
}

export function App({ config, history, onConfigChange, onHistoryChange }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("home");
  const [error, setError] = useState<string | null>(null);

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
        return (
          <HomeScreen
            history={history}
            onNavigate={setScreen}
          />
        );
      case "generate":
        return (
          <GenerateScreen
            config={config}
            onBack={() => setScreen("home")}
            onComplete={() => {
              onHistoryChange();
              setScreen("home");
            }}
            onError={handleError}
          />
        );
      case "edit":
        return (
          <EditScreen
            config={config}
            mode="edit"
            onBack={() => setScreen("home")}
            onComplete={() => {
              onHistoryChange();
              setScreen("home");
            }}
            onError={handleError}
          />
        );
      case "variations":
        return (
          <EditScreen
            config={config}
            mode="variations"
            onBack={() => setScreen("home")}
            onComplete={() => {
              onHistoryChange();
              setScreen("home");
            }}
            onError={handleError}
          />
        );
      case "upscale":
        return (
          <EditScreen
            config={config}
            mode="upscale"
            onBack={() => setScreen("home")}
            onComplete={() => {
              onHistoryChange();
              setScreen("home");
            }}
            onError={handleError}
          />
        );
      case "rmbg":
        return (
          <EditScreen
            config={config}
            mode="rmbg"
            onBack={() => setScreen("home")}
            onComplete={() => {
              onHistoryChange();
              setScreen("home");
            }}
            onError={handleError}
          />
        );
      case "gallery":
        return (
          <GalleryScreen
            history={history}
            onBack={() => setScreen("home")}
          />
        );
      case "settings":
        return (
          <SettingsScreen
            config={config}
            onSave={async (newConfig) => {
              await onConfigChange(newConfig);
              setScreen("home");
            }}
            onBack={() => setScreen("home")}
          />
        );
      default:
        return <HomeScreen history={history} onNavigate={setScreen} />;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {" "}falky studio{" "}
        </Text>
        <Text dimColor>
          {screen === "home" ? "↑↓ Navigate  Enter: Select  q: Quit" : "Esc: Back  q: Quit"}
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {renderScreen()}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          Session: ${history.totalCost.session.toFixed(2)} | Today: ${history.totalCost.today.toFixed(2)} | All-time: ${history.totalCost.allTime.toFixed(2)}
        </Text>
      </Box>
    </Box>
  );
}
