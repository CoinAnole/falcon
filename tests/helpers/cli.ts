import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { getTestHome } from "./env";

export interface CliResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

const KILL_GRACE_MS = 500;
const STREAM_READ_TIMEOUT_BUFFER_MS = 3000;

// Global temp directory for CLI test outputs (within project root for path validation)
const globalKey = "__FALCON_TEST_OUTPUT_DIR__";
const globalStore = globalThis as unknown as Record<string, string | undefined>;
const existingDir = globalStore[globalKey];
// Use a directory within project root so it's within cwd for path validation
const testOutputDir =
	existingDir ?? mkdtempSync(join(process.cwd(), ".falcon-test-output-"));

if (!existingDir) {
	(globalStore as Record<string, string>)[globalKey] = testOutputDir;
}

/**
 * Clean up all generated test files.
 * Call this in afterAll() to ensure test files don't accumulate.
 * @param removeDir - If true, completely remove the output directory. If false (default), empty it but keep the directory.
 */
export function cleanupTestFiles(removeDir = false): void {
	try {
		// Clean up temp output directory
		rmSync(testOutputDir, { recursive: true, force: true });
		if (!removeDir) {
			mkdirSync(testOutputDir, { recursive: true });
		}

		// Clean up any files in project root that match test patterns
		const projectRoot = process.cwd();
		const files = readdirSync(projectRoot);
		const patterns = [
			/^falcon-.*\.(png|jpg|jpeg|webp)$/,
			/^falcon-upscale-.*\.(png|jpg|jpeg|webp)$/,
			/^falcon-nobg-.*\.(png|jpg|jpeg|webp)$/,
			/^falcon-edit-.*\.(png|jpg|jpeg|webp)$/,
			/^test-out\.(png|jpg|jpeg|webp)$/,
			/^test-output\.(png|jpg|jpeg|webp)$/,
			/-up[248]x\.(png|jpg|jpeg|webp)$/,
			/-nobg\.(png|jpg|jpeg|webp)$/,
		];
		for (const file of files) {
			for (const pattern of patterns) {
				if (pattern.test(file)) {
					try {
						unlinkSync(join(projectRoot, file));
					} catch {
						// Ignore cleanup errors
					}
					break;
				}
			}
		}
	} catch {
		// Ignore cleanup errors
	}
}

/**
 * Get the current test output directory.
 */
export function getTestOutputDir(): string {
	return testOutputDir;
}

/**
 * Get a path for a test output file.
 */
export function getTestOutputPath(filename: string): string {
	return join(testOutputDir, filename);
}

// Counter for unique output filenames
let outputCounter = 0;

export interface RunCliOptions {
	envOverrides?: Record<string, string>;
	timeoutMs?: number;
}

export async function runCli(
	args: string[],
	envOverrides: Record<string, string> = {},
	timeoutMs = 10000,
): Promise<CliResult> {
	const debugEnabled = process.env.FALCON_CLI_TEST_DEBUG === "1";
	const debugLog = (message: string, meta?: Record<string, unknown>) => {
		if (!debugEnabled) return;
		const payload = meta ? ` ${JSON.stringify(meta)}` : "";
		console.error(`[runCli] ${message}${payload}`);
	};
	const defaultFixtureEnv: Record<string, string> = {
		FALCON_PRICING_FIXTURE: "tests/fixtures/pricing.json",
		FALCON_API_FIXTURE: "tests/fixtures/api-response.json",
		FALCON_DOWNLOAD_FIXTURE: "tests/fixtures/tiny.png",
	};
	const mergedOverrides: Record<string, string> = { ...envOverrides };
	for (const [key, value] of Object.entries(defaultFixtureEnv)) {
		if (mergedOverrides[key] === undefined && process.env[key] === undefined) {
			mergedOverrides[key] = value;
		}
	}
	const startTime = Date.now();
	let timeoutFired = false;
	// If this is a generation command without explicit output, redirect to temp directory
	const hasOutputFlag = args.includes("--output") || args.includes("-o");
	const hasPrompt = args.length > 0 && !args[0].startsWith("-");
	const isSubcommand = ["pricing"].includes(args[0]);
	const isGeneration =
		envOverrides.FALCON_DOWNLOAD_FIXTURE &&
		hasPrompt &&
		!isSubcommand &&
		!hasOutputFlag &&
		!args.includes("--up") &&
		!args.includes("--rmbg") &&
		!args.includes("--vary");

	const testArgs = [...args];
	if (isGeneration) {
		outputCounter++;
		const outputPath = join(testOutputDir, `test-gen-${outputCounter}.png`);
		testArgs.push("--output", outputPath);
	}

	const envKeys = Object.keys(mergedOverrides);
	const clearedKeys = envKeys.filter((key) => mergedOverrides[key] === "");
	const setKeys = envKeys.filter((key) => mergedOverrides[key] !== "");
	const fixtureKeys = [
		"FALCON_PRICING_FIXTURE",
		"FALCON_API_FIXTURE",
		"FALCON_DOWNLOAD_FIXTURE",
	];
	const fixtureEnv = fixtureKeys.reduce<Record<string, string | undefined>>(
		(acc, key) => {
			acc[key] = mergedOverrides[key] || process.env[key];
			return acc;
		},
		{},
	);
	debugLog("spawn", {
		args: testArgs,
		timeoutMs,
		setKeys,
		clearedKeys,
		fixtures: fixtureEnv,
	});
	const runHome = getTestHome();
	const childEnv: Record<string, string> = {
		...process.env,
		HOME: runHome,
		FALCON_TEST_MODE: "1",
	} as Record<string, string>;
	for (const [key, value] of Object.entries(mergedOverrides)) {
		if (value === "") {
			delete childEnv[key];
		} else {
			childEnv[key] = value;
		}
	}

	const proc = Bun.spawn(["bun", "src/index.ts", ...testArgs], {
		cwd: process.cwd(),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env: childEnv,
	});
	debugLog("spawned", {
		pid: proc.pid,
		hasStdout: Boolean(proc.stdout),
		hasStderr: Boolean(proc.stderr),
	});

	const streamTimeoutMs = timeoutMs + STREAM_READ_TIMEOUT_BUFFER_MS;
	const stdoutPromise = readStreamWithTimeout(
		proc.stdout,
		"stdout",
		streamTimeoutMs,
		debugLog,
	);
	const stderrPromise = readStreamWithTimeout(
		proc.stderr,
		"stderr",
		streamTimeoutMs,
		debugLog,
	);

	try {
		debugLog("waitForExit:begin", { pid: proc.pid, timeoutMs });
		const { exitCode, timedOut } = await waitForExit(proc, timeoutMs, debugLog);
		timeoutFired = timedOut;
		debugLog("exit", {
			exitCode,
			timeoutFired,
			durationMs: Date.now() - startTime,
		});
		return finalizeResult(
			exitCode,
			stdoutPromise,
			stderrPromise,
			debugLog,
			timeoutFired,
		);
	} finally {
		// HOME cleanup handled by tests/helpers/env.ts
	}
}

async function waitForExit(
	proc: ReturnType<typeof Bun.spawn>,
	timeoutMs: number,
	debugLog: (message: string, meta?: Record<string, unknown>) => void,
): Promise<{ exitCode: number; timedOut: boolean }> {
	return await new Promise<{ exitCode: number; timedOut: boolean }>(
		(resolve) => {
			let resolved = false;
			let timedOut = false;
			let killGraceTimer: ReturnType<typeof setTimeout> | null = null;
			let forceResolveTimer: ReturnType<typeof setTimeout> | null = null;
			const cleanup = () => {
				if (killGraceTimer) {
					clearTimeout(killGraceTimer);
					killGraceTimer = null;
				}
				if (forceResolveTimer) {
					clearTimeout(forceResolveTimer);
					forceResolveTimer = null;
				}
			};
			const timeoutId = setTimeout(() => {
				if (resolved) return;
				timedOut = true;
				debugLog("timeout", { timeoutMs, pid: proc.pid });
				try {
					proc.kill("SIGTERM");
					debugLog("timeout:sigterm", { pid: proc.pid });
				} catch {
					debugLog("timeout:sigterm:error", { pid: proc.pid });
				}
				killGraceTimer = setTimeout(() => {
					if (resolved) return;
					try {
						proc.kill("SIGKILL");
						debugLog("timeout:sigkill", { pid: proc.pid });
					} catch {
						debugLog("timeout:sigkill:error", { pid: proc.pid });
					}
				}, KILL_GRACE_MS);
				forceResolveTimer = setTimeout(() => {
					if (resolved) return;
					resolved = true;
					debugLog("timeout:resolve-fallback", { pid: proc.pid });
					resolve({ exitCode: 143, timedOut: true });
				}, KILL_GRACE_MS + 1000);
			}, timeoutMs);

			void proc.exited.then((exitCode) => {
				debugLog("exited", { exitCode, resolved, pid: proc.pid, timedOut });
				if (resolved) return;
				resolved = true;
				clearTimeout(timeoutId);
				cleanup();
				resolve({ exitCode, timedOut });
			});
		},
	);
}

async function readStreamWithTimeout(
	stream: ReadableStream,
	streamName: "stdout" | "stderr",
	timeoutMs: number,
	debugLog: (message: string, meta?: Record<string, unknown>) => void,
): Promise<{ text: string; timedOut: boolean }> {
	const readPromise = Bun.readableStreamToText(stream)
		.then((text) => {
			debugLog(`${streamName}:closed`, { length: text.length });
			return text;
		})
		.catch((error) => {
			debugLog(`${streamName}:error`, {
				error: error instanceof Error ? error.message : String(error),
			});
			return "";
		});

	return await new Promise<{ text: string; timedOut: boolean }>((resolve) => {
		let settled = false;
		const timeoutId = setTimeout(() => {
			if (settled) return;
			settled = true;
			debugLog(`${streamName}:timeout`, { timeoutMs });
			resolve({ text: "", timedOut: true });
		}, timeoutMs);

		void readPromise.then((text) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			resolve({ text, timedOut: false });
		});
	});
}

async function finalizeResult(
	exitCode: number,
	stdoutPromise: Promise<{ text: string; timedOut: boolean }>,
	stderrPromise: Promise<{ text: string; timedOut: boolean }>,
	debugLog: (message: string, meta?: Record<string, unknown>) => void,
	timedOut: boolean,
): Promise<CliResult> {
	debugLog("finalize:begin", { exitCode });
	const [stdoutResult, stderrResult] = await Promise.all([
		stdoutPromise,
		stderrPromise,
	]);
	const stdout = stdoutResult.text;
	const stderr = stderrResult.text;
	let finalStderr = stderr;
	if (timedOut || stdoutResult.timedOut || stderrResult.timedOut) {
		const suffix = stderr.endsWith("\n") || stderr.length === 0 ? "" : "\n";
		const timeoutReason = timedOut
			? "[runCli] process timeout exceeded"
			: "[runCli] stream read timeout exceeded";
		finalStderr = `${stderr}${suffix}${timeoutReason}\n`;
	}
	debugLog("streams:done", {
		stdoutTimedOut: stdoutResult.timedOut,
		stderrTimedOut: stderrResult.timedOut,
		stdoutLength: stdout.length,
		stderrLength: finalStderr.length,
	});
	debugLog("streams", {
		stdoutTimedOut: stdoutResult.timedOut,
		stderrTimedOut: stderrResult.timedOut,
		stdoutLength: stdout.length,
		stderrLength: finalStderr.length,
	});

	if (finalStderr.length > 0) {
		debugLog("stderr:preview", {
			preview: finalStderr.slice(0, 600),
			truncated: finalStderr.length > 600,
		});
	}
	if (stdout.length > 0) {
		debugLog("stdout:preview", {
			preview: stdout.slice(0, 300),
			truncated: stdout.length > 300,
		});
	}

	return { exitCode, stdout, stderr: finalStderr };
}
