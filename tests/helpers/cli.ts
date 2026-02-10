import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getTestHome } from "./env";

export interface CliResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

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

	const envKeys = Object.keys(envOverrides);
	const clearedKeys = envKeys.filter((key) => envOverrides[key] === "");
	const setKeys = envKeys.filter((key) => envOverrides[key] !== "");
	const fixtureKeys = [
		"FALCON_PRICING_FIXTURE",
		"FALCON_API_FIXTURE",
		"FALCON_DOWNLOAD_FIXTURE",
	];
	const fixtureEnv = fixtureKeys.reduce<Record<string, string | undefined>>(
		(acc, key) => {
			acc[key] = envOverrides[key] || process.env[key];
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
	for (const [key, value] of Object.entries(envOverrides)) {
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

	// Read stdout and stderr using Bun's helper which handles process exit correctly
	const stdoutPromise = Bun.readableStreamToText(proc.stdout).then((stdout) => {
		debugLog("stdout:closed", { length: stdout.length });
		return stdout;
	});
	const stderrPromise = Bun.readableStreamToText(proc.stderr).then((stderr) => {
		debugLog("stderr:closed", { length: stderr.length });
		return stderr;
	});

	try {
		debugLog("waitForExit:begin", { pid: proc.pid, timeoutMs });
		const { exitCode, timedOut } = await waitForExit(proc, timeoutMs, debugLog);
		timeoutFired = timedOut;
		debugLog("exit", {
			exitCode,
			timeoutFired,
			durationMs: Date.now() - startTime,
		});
		return finalizeResult(exitCode, stdoutPromise, stderrPromise, debugLog);
	} catch (error) {
		throw error;
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
			const timeoutId = setTimeout(() => {
				if (resolved) return;
				resolved = true;
				debugLog("timeout", { timeoutMs, pid: proc.pid });
				proc.kill();
				debugLog("timeout:kill", { pid: proc.pid });
				resolve({ exitCode: 143, timedOut: true });
			}, timeoutMs);

			void proc.exited.then((exitCode) => {
				debugLog("exited", { exitCode, resolved, pid: proc.pid });
				if (resolved) return;
				resolved = true;
				clearTimeout(timeoutId);
				resolve({ exitCode, timedOut: false });
			});
		},
	);
}

async function finalizeResult(
	exitCode: number,
	stdoutPromise: Promise<string>,
	stderrPromise: Promise<string>,
	debugLog: (message: string, meta?: Record<string, unknown>) => void,
): Promise<CliResult> {
	debugLog("finalize:begin", { exitCode });
	const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
	debugLog("streams:done", {
		stdoutTimedOut: false,
		stderrTimedOut: false,
		stdoutLength: stdout.length,
		stderrLength: stderr.length,
	});
	debugLog("streams", {
		stdoutTimedOut: false,
		stderrTimedOut: false,
		stdoutLength: stdout.length,
		stderrLength: stderr.length,
	});

	if (stderr.length > 0) {
		debugLog("stderr:preview", {
			preview: stderr.slice(0, 600),
			truncated: stderr.length > 600,
		});
	}
	if (stdout.length > 0) {
		debugLog("stdout:preview", {
			preview: stdout.slice(0, 300),
			truncated: stdout.length > 300,
		});
	}

	return { exitCode, stdout, stderr };
}
