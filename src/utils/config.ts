import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AspectRatio, Resolution } from "../api/models";

const FALKY_DIR = join(homedir(), ".falky");
const CONFIG_PATH = join(FALKY_DIR, "config.json");
const HISTORY_PATH = join(FALKY_DIR, "history.json");
const LOCAL_CONFIG_PATH = ".falkyrc";

export interface FalkyConfig {
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

const DEFAULT_CONFIG: FalkyConfig = {
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

function ensureFalkyDir(): void {
  if (!existsSync(FALKY_DIR)) {
    mkdirSync(FALKY_DIR, { recursive: true });
  }
}

export async function loadConfig(): Promise<FalkyConfig> {
  ensureFalkyDir();

  let config = { ...DEFAULT_CONFIG };

  // Load global config
  if (existsSync(CONFIG_PATH)) {
    try {
      const file = Bun.file(CONFIG_PATH);
      const globalConfig = await file.json();
      config = { ...config, ...globalConfig };
    } catch {
      // Ignore parse errors
    }
  }

  // Load local config (overrides global)
  if (existsSync(LOCAL_CONFIG_PATH)) {
    try {
      const file = Bun.file(LOCAL_CONFIG_PATH);
      const localConfig = await file.json();
      config = { ...config, ...localConfig };
    } catch {
      // Ignore parse errors
    }
  }

  return config;
}

export async function saveConfig(config: Partial<FalkyConfig>): Promise<void> {
  ensureFalkyDir();

  let existing: FalkyConfig = DEFAULT_CONFIG;
  if (existsSync(CONFIG_PATH)) {
    try {
      const file = Bun.file(CONFIG_PATH);
      existing = await file.json();
    } catch {
      // Ignore
    }
  }

  const merged = { ...existing, ...config };
  await Bun.write(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

export async function loadHistory(): Promise<History> {
  ensureFalkyDir();

  if (!existsSync(HISTORY_PATH)) {
    return { ...DEFAULT_HISTORY };
  }

  try {
    const file = Bun.file(HISTORY_PATH);
    const history: History = await file.json();

    // Reset session cost if it's a new day
    const today = new Date().toISOString().split("T")[0];
    if (history.lastSessionDate !== today) {
      history.totalCost.session = 0;
      history.totalCost.today = 0;
      history.lastSessionDate = today;
    }

    return history;
  } catch {
    return { ...DEFAULT_HISTORY };
  }
}

export async function saveHistory(history: History): Promise<void> {
  ensureFalkyDir();
  await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2));
}

export async function addGeneration(generation: Generation): Promise<void> {
  const history = await loadHistory();

  history.generations.unshift(generation);
  history.totalCost.session += generation.cost;
  history.totalCost.today += generation.cost;
  history.totalCost.allTime += generation.cost;
  history.lastSessionDate = new Date().toISOString().split("T")[0];

  // Keep only last 100 generations
  if (history.generations.length > 100) {
    history.generations = history.generations.slice(0, 100);
  }

  await saveHistory(history);
}

export async function getLastGeneration(): Promise<Generation | null> {
  const history = await loadHistory();
  return history.generations[0] || null;
}

export function getApiKey(config: FalkyConfig): string {
  // Environment variable takes precedence
  const envKey = process.env.FAL_KEY;
  if (envKey) return envKey;

  // Fall back to config
  if (config.apiKey) return config.apiKey;

  throw new Error(
    "FAL_KEY not found. Set FAL_KEY environment variable or add apiKey to ~/.falky/config.json"
  );
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export { FALKY_DIR, CONFIG_PATH, HISTORY_PATH };
