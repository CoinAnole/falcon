#!/usr/bin/env bun
import { render } from "ink";
import React from "react";
import { setApiKey } from "./api/fal";
import { runCli } from "./cli";
import { App } from "./studio/App";
import {
	type FalconConfig,
	getApiKey,
	loadConfig,
	loadHistory,
	saveConfig,
} from "./utils/config";
import { clearLog, logger } from "./utils/logger";

async function main() {
	// Initialize logging - clear log on fresh start
	clearLog();
	logger.info("Falcon starting", {
		mode: process.argv.length > 2 ? "cli" : "studio",
	});

	// Load config and set API key
	const config = await loadConfig();
	try {
		const apiKey = getApiKey(config);
		setApiKey(apiKey);
	} catch {
		// API key will be checked when needed
	}

	const args = process.argv.slice(2);

	// If there are arguments (prompt or flags), run CLI mode
	if (args.length > 0) {
		await runCli(["node", "falcon", ...args]);
		// Allow natural process exit - don't force exit to ensure streams are flushed
		return;
	}

	// No arguments = launch Studio mode
	await launchStudio();
}

async function launchStudio() {
	let config = await loadConfig();
	let history = await loadHistory();

	const handleConfigChange = async (newConfig: Partial<FalconConfig>) => {
		await saveConfig(newConfig);
		config = { ...config, ...newConfig };
		// Re-render to propagate updated config to App component
		rerender(
			React.createElement(App, {
				config,
				history,
				onConfigChange: handleConfigChange,
				onHistoryChange: handleHistoryChange,
			}),
		);
	};

	const handleHistoryChange = async () => {
		history = await loadHistory();
		// Re-render with new history
		rerender(
			React.createElement(App, {
				config,
				history,
				onConfigChange: handleConfigChange,
				onHistoryChange: handleHistoryChange,
			}),
		);
	};

	const { rerender, waitUntilExit } = render(
		React.createElement(App, {
			config,
			history,
			onConfigChange: handleConfigChange,
			onHistoryChange: handleHistoryChange,
		}),
	);

	await waitUntilExit();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
