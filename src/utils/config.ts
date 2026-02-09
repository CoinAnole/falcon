import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AspectRatio, Resolution } from "../api/models";

const FALCON_DIR = join(homedir(), ".falcon");
const CONFIG_PATH = join(FALCON_DIR, "config.json");
const HISTORY_PATH = join(FALCON_DIR, "history.json");
const LOCAL_CONFIG_PATH = ".falconrc";

export interface FalconConfig {
	apiKey?: string;
	defaultModel: string;
	defaultAspect: AspectRatio;
	defaultResolution: Resolution;
	openAfterGenerate: boolean;
	upscaler: "clarity" | "crystal";
	backgroundRemover: "rmbg" | "bria";
}

export interface Generation {
	id: string;
	prompt: string;
	model: string;
	aspect: AspectRatio;
	resolution: Resolution;
	output: string;
	cost: number;
	timestamp: string;
	editedFrom?: string;
}

export interface History {
	generations: Generation[];
	totalCost: {
		session: number;
		today: number;
		allTime: number;
	};
	lastSessionDate: string;
}

const DEFAULT_CONFIG: FalconConfig = {
	defaultModel: "banana",
	defaultAspect: "1:1",
	defaultResolution: "2K",
	openAfterGenerate: true,
	upscaler: "clarity",
	backgroundRemover: "rmbg",
};

const DEFAULT_HISTORY: History = {
	generations: [],
	totalCost: {
		session: 0,
		today: 0,
		allTime: 0,
	},
	lastSessionDate: new Date().toISOString().split("T")[0],
};

function ensureFalconDir(): void {
	if (!existsSync(FALCON_DIR)) {
		mkdirSync(FALCON_DIR, { recursive: true, mode: 0o700 });
	}
}

/**
 * Write file atomically using temp-rename pattern
 * Prevents corruption if process is interrupted mid-write
 */
async function atomicWrite(filePath: string, data: string): Promise<void> {
	const tempPath = `${filePath}.${randomUUID()}.tmp`;
	try {
		// Write to temp file with restrictive permissions
		writeFileSync(tempPath, data, { mode: 0o600 });
		// Atomic rename (on POSIX systems)
		renameSync(tempPath, filePath);
	} catch (err) {
		// Clean up temp file on failure
		try {
			if (existsSync(tempPath)) {
				const { unlinkSync } = await import("node:fs");
				unlinkSync(tempPath);
			}
		} catch {
			// Ignore cleanup errors
		}
		throw err;
	}
}

export async function loadConfig(): Promise<FalconConfig> {
	ensureFalconDir();

	let config = { ...DEFAULT_CONFIG };

	// Load global config
	if (existsSync(CONFIG_PATH)) {
		try {
			const file = Bun.file(CONFIG_PATH);
			const globalConfig = await file.json();
			config = { ...config, ...globalConfig };
		} catch (err) {
			console.error(
				`Warning: Failed to parse ${CONFIG_PATH}: ${(err as Error).message}`
			);
			console.error("Using default configuration.");
		}
	}

	// Load local config (overrides global)
	if (existsSync(LOCAL_CONFIG_PATH)) {
		try {
			const file = Bun.file(LOCAL_CONFIG_PATH);
			const localConfig = await file.json();
			config = { ...config, ...localConfig };
		} catch (err) {
			console.error(
				`Warning: Failed to parse ${LOCAL_CONFIG_PATH}: ${(err as Error).message}`
			);
		}
	}

	return config;
}

export async function saveConfig(config: Partial<FalconConfig>): Promise<void> {
	ensureFalconDir();

	let existing: FalconConfig = DEFAULT_CONFIG;
	if (existsSync(CONFIG_PATH)) {
		try {
			const file = Bun.file(CONFIG_PATH);
			existing = await file.json();
		} catch {
			// Use defaults if existing config is corrupted
		}
	}

	const merged = { ...existing, ...config };
	await atomicWrite(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

export async function loadHistory(): Promise<History> {
	ensureFalconDir();

	if (!existsSync(HISTORY_PATH)) {
		return { ...DEFAULT_HISTORY };
	}

	try {
		const file = Bun.file(HISTORY_PATH);
		const history: History = await file.json();

		// Reset session/daily costs if it's a new day
		const today = new Date().toISOString().split("T")[0];
		if (history.lastSessionDate !== today) {
			history.totalCost.session = 0;
			history.totalCost.today = 0;
			history.lastSessionDate = today;
		}

		return history;
	} catch (err) {
		console.error(
			`Warning: Failed to load history from ${HISTORY_PATH}: ${(err as Error).message}`
		);
		console.error("Starting with empty history.");
		return { ...DEFAULT_HISTORY };
	}
}

export async function saveHistory(history: History): Promise<void> {
	ensureFalconDir();
	await atomicWrite(HISTORY_PATH, JSON.stringify(history, null, 2));
}

export async function addGeneration(generation: Generation): Promise<void> {
	const history = await loadHistory();

	// Use push (O(1)) instead of unshift (O(n))
	// Generations are stored newest-last, reversed when reading
	history.generations.push(generation);
	history.totalCost.session += generation.cost;
	history.totalCost.today += generation.cost;
	history.totalCost.allTime += generation.cost;
	history.lastSessionDate = new Date().toISOString().split("T")[0];

	// Keep only last 100 generations (remove oldest from front)
	if (history.generations.length > 100) {
		history.generations.shift();
	}

	await saveHistory(history);
}

export async function getLastGeneration(): Promise<Generation | null> {
	const history = await loadHistory();
	// Generations are stored oldest-first, so last element is most recent
	return history.generations.at(-1) || null;
}

export function getApiKey(config: FalconConfig): string {
	// Environment variable takes precedence
	const envKey = process.env.FAL_KEY;
	if (envKey) {
		return envKey;
	}

	// Fall back to config
	if (config.apiKey) {
		return config.apiKey;
	}

	throw new Error(
		"FAL_KEY not found. Set FAL_KEY environment variable or add apiKey to ~/.falcon/config.json"
	);
}

export function generateId(): string {
	// Use cryptographically secure UUID for guaranteed uniqueness
	return randomUUID();
}

export { FALCON_DIR, CONFIG_PATH, HISTORY_PATH };
