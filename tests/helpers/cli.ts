import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getTestHome } from "./env";

export interface CliResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

const KILL_GRACE_MS = 500;
const STREAM_READ_TIMEOUT_BUFFER_MS = 3000;
const DEFAULT_RUNCLI_TIMEOUT_MS = 20_000;
const PROCESS_TIMEOUT_REASON = "[runCli] process timeout exceeded";
const STREAM_TIMEOUT_REASON = "[runCli] stream read timeout exceeded";
const MAX_RUNCLI_ATTEMPTS = 2;
const BUN_EXECUTABLE_REGEX = /(^|[/\\])bun(\.exe)?$/i;

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

const cleanupHookKey = "__FALCON_TEST_OUTPUT_CLEANUP_HOOK__";
const hasCleanupHook = globalStore[cleanupHookKey] === "1";
let cleanedUp = false;

function cleanupOnProcessExit(): void {
	if (cleanedUp) {
		return;
	}
	cleanedUp = true;
	cleanupTestFiles(true);
	delete globalStore[globalKey];
}

if (!hasCleanupHook) {
	globalStore[cleanupHookKey] = "1";
	process.once("exit", cleanupOnProcessExit);
	process.once("SIGINT", () => {
		cleanupOnProcessExit();
		process.exit(130);
	});
	process.once("SIGTERM", () => {
		cleanupOnProcessExit();
		process.exit(143);
	});
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
let runCliQueue: Promise<void> = Promise.resolve();

export interface RunCliOptions {
	envOverrides?: Record<string, string>;
	timeoutMs?: number;
}

export async function runCli(
	args: string[],
	envOverrides: Record<string, string> = {},
	timeoutMs = DEFAULT_RUNCLI_TIMEOUT_MS
): Promise<CliResult> {
	const runTask = async () => {
		return await runCliWithRetry(args, envOverrides, timeoutMs);
	};
	const queuedTask = runCliQueue.then(runTask, runTask);
	runCliQueue = queuedTask.then(
		() => undefined,
		() => undefined
	);
	return await queuedTask;
}

function isBunExecutable(path: string): boolean {
	return BUN_EXECUTABLE_REGEX.test(path);
}

export function resolveBunBinary(
	envOverrides: Record<string, string> = {}
): string {
	const explicit =
		envOverrides.FALCON_TEST_BUN_BIN || process.env.FALCON_TEST_BUN_BIN;
	if (explicit) {
		return explicit;
	}
	if (isBunExecutable(process.execPath)) {
		return process.execPath;
	}
	return "bun";
}

function resolveCliEntry(envOverrides: Record<string, string>): string {
	return (
		envOverrides.FALCON_TEST_CLI_ENTRY ||
		process.env.FALCON_TEST_CLI_ENTRY ||
		"src/index.ts"
	);
}

function stripTimeoutMarkers(stderr: string): string {
	return stderr
		.split("\n")
		.filter(
			(line) =>
				!(
					line.startsWith(PROCESS_TIMEOUT_REASON) ||
					line.startsWith(STREAM_TIMEOUT_REASON) ||
					line.startsWith("[runCli] timeout diagnostic:")
				)
		)
		.join("\n")
		.trim();
}

function shouldRetryOnLaunchTimeout(
	result: CliResult,
	attempt: number,
	maxAttempts: number
): boolean {
	if (attempt >= maxAttempts) {
		return false;
	}
	if (result.exitCode !== 143) {
		return false;
	}
	if (!result.stderr.includes(PROCESS_TIMEOUT_REASON)) {
		return false;
	}
	if (result.stdout.trim().length > 0) {
		return false;
	}
	return stripTimeoutMarkers(result.stderr).length === 0;
}

function createDebugLogger(): (
	message: string,
	meta?: Record<string, unknown>
) => void {
	const debugEnabled = process.env.FALCON_CLI_TEST_DEBUG === "1";
	return (message: string, meta?: Record<string, unknown>) => {
		if (!debugEnabled) {
			return;
		}
		const payload = meta ? ` ${JSON.stringify(meta)}` : "";
		console.error(`[runCli] ${message}${payload}`);
	};
}

async function runCliWithRetry(
	args: string[],
	envOverrides: Record<string, string>,
	timeoutMs: number
): Promise<CliResult> {
	const debugLog = createDebugLogger();
	const bunBinary = resolveBunBinary(envOverrides);
	debugLog("runtime", { bunBinary, execPath: process.execPath });

	let attempt = 1;
	let result = await runCliAttempt(
		args,
		envOverrides,
		timeoutMs,
		attempt,
		bunBinary
	);
	while (shouldRetryOnLaunchTimeout(result, attempt, MAX_RUNCLI_ATTEMPTS)) {
		debugLog("retry:launch-timeout", {
			attempt,
			nextAttempt: attempt + 1,
			maxAttempts: MAX_RUNCLI_ATTEMPTS,
			bunBinary,
		});
		attempt++;
		result = await runCliAttempt(
			args,
			envOverrides,
			timeoutMs,
			attempt,
			bunBinary
		);
	}
	return result;
}

async function runCliAttempt(
	args: string[],
	envOverrides: Record<string, string>,
	timeoutMs: number,
	attempt: number,
	bunBinary: string
): Promise<CliResult> {
	const debugLog = createDebugLogger();
	const cliEntry = resolveCliEntry(envOverrides);
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
	// If this is an image-producing command without explicit output, redirect to temp directory.
	const hasOutputFlag = args.includes("--output") || args.includes("-o");
	const hasPrompt = args.length > 0 && !args[0].startsWith("-");
	const isSubcommand = ["pricing"].includes(args[0]);
	const isPostProcess =
		args.includes("--vary") || args.includes("--up") || args.includes("--rmbg");
	const isImageProducing =
		!(isSubcommand || hasOutputFlag) && (hasPrompt || isPostProcess);

	const testArgs = [...args];
	// Test files can clean up the shared helper output directory in parallel
	// (via afterAll hooks), so make sure it exists before every spawn.
	mkdirSync(testOutputDir, { recursive: true });
	if (isImageProducing) {
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
		{}
	);
	debugLog("spawn", {
		attempt,
		maxAttempts: MAX_RUNCLI_ATTEMPTS,
		args: testArgs,
		timeoutMs,
		bunBinary,
		cliEntry,
		setKeys,
		clearedKeys,
		fixtures: fixtureEnv,
	});
	const runHome = getTestHome();
	const childEnv: Record<string, string> = {
		...process.env,
		HOME: runHome,
		FALCON_TEST_MODE: "1",
		FALCON_RUNCLI_ATTEMPT: String(attempt),
		FALCON_RUNCLI_MAX_ATTEMPTS: String(MAX_RUNCLI_ATTEMPTS),
	} as Record<string, string>;
	for (const [key, value] of Object.entries(mergedOverrides)) {
		if (value === "") {
			delete childEnv[key];
		} else {
			childEnv[key] = value;
		}
	}

	const proc = Bun.spawn([bunBinary, cliEntry, ...testArgs], {
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
		debugLog
	);
	const stderrPromise = readStreamWithTimeout(
		proc.stderr,
		"stderr",
		streamTimeoutMs,
		debugLog
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
			attempt,
			bunBinary,
			MAX_RUNCLI_ATTEMPTS
		);
	} finally {
		// HOME cleanup handled by tests/helpers/env.ts
	}
}

async function waitForExit(
	proc: ReturnType<typeof Bun.spawn>,
	timeoutMs: number,
	debugLog: (message: string, meta?: Record<string, unknown>) => void
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
				if (resolved) {
					return;
				}
				timedOut = true;
				debugLog("timeout", { timeoutMs, pid: proc.pid });
				try {
					proc.kill("SIGTERM");
					debugLog("timeout:sigterm", { pid: proc.pid });
				} catch {
					debugLog("timeout:sigterm:error", { pid: proc.pid });
				}
				killGraceTimer = setTimeout(() => {
					if (resolved) {
						return;
					}
					try {
						proc.kill("SIGKILL");
						debugLog("timeout:sigkill", { pid: proc.pid });
					} catch {
						debugLog("timeout:sigkill:error", { pid: proc.pid });
					}
				}, KILL_GRACE_MS);
				forceResolveTimer = setTimeout(() => {
					if (resolved) {
						return;
					}
					resolved = true;
					debugLog("timeout:resolve-fallback", { pid: proc.pid });
					resolve({ exitCode: 143, timedOut: true });
				}, KILL_GRACE_MS + 1000);
			}, timeoutMs);

			proc.exited.then((exitCode) => {
				debugLog("exited", { exitCode, resolved, pid: proc.pid, timedOut });
				if (resolved) {
					return;
				}
				resolved = true;
				clearTimeout(timeoutId);
				cleanup();
				resolve({ exitCode, timedOut });
			});
		}
	);
}

async function readStreamWithTimeout(
	stream: ReadableStream,
	streamName: "stdout" | "stderr",
	timeoutMs: number,
	debugLog: (message: string, meta?: Record<string, unknown>) => void
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
			if (settled) {
				return;
			}
			settled = true;
			debugLog(`${streamName}:timeout`, { timeoutMs });
			resolve({ text: "", timedOut: true });
		}, timeoutMs);

		readPromise.then((text) => {
			if (settled) {
				return;
			}
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
	attempt: number,
	bunBinary: string,
	maxAttempts: number
): Promise<CliResult> {
	debugLog("finalize:begin", {
		exitCode,
		attempt,
		maxAttempts,
		bunBinary,
	});
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
			? PROCESS_TIMEOUT_REASON
			: STREAM_TIMEOUT_REASON;
		const timeoutDiagnostic = `[runCli] timeout diagnostic: bun=${bunBinary} attempt=${attempt}/${maxAttempts}`;
		finalStderr = `${stderr}${suffix}${timeoutReason}\n${timeoutDiagnostic}\n`;
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
