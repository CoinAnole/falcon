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
	timeoutMs = 4500,
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

	debugLog("spawn", { args: testArgs, timeoutMs });
	const childEnv: Record<string, string> = {
		...process.env,
		HOME: getTestHome(),
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

	// Read stdout and stderr using Bun's helper which handles process exit correctly
	const stdoutPromise = Bun.readableStreamToText(proc.stdout);
	const stderrPromise = Bun.readableStreamToText(proc.stderr);

	try {
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
				debugLog("timeout", { timeoutMs });
				proc.kill();
				resolve({ exitCode: 143, timedOut: true });
			}, timeoutMs);

			void proc.exited.then((exitCode) => {
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
	let stdoutTimedOut = false;
	let stderrTimedOut = false;
	const stdout = await Promise.race([
		stdoutPromise,
		new Promise<string>((resolve) =>
			setTimeout(() => {
				stdoutTimedOut = true;
				resolve("");
			}, 250),
		),
	]);
	const stderr = await Promise.race([
		stderrPromise,
		new Promise<string>((resolve) =>
			setTimeout(() => {
				stderrTimedOut = true;
				resolve("");
			}, 250),
		),
	]);
	debugLog("streams", {
		stdoutTimedOut,
		stderrTimedOut,
		stdoutLength: stdout.length,
		stderrLength: stderr.length,
	});

	return { exitCode, stdout, stderr };
}
