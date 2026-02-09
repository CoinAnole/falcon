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
	timeoutMs = 15000,
): Promise<CliResult> {
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

	const proc = Bun.spawn(["bun", "src/index.ts", ...testArgs], {
		cwd: process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			HOME: getTestHome(),
			FALCON_TEST_MODE: "1",
			...envOverrides,
		},
	});

	// Create a timeout promise that properly cancels stream reading
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let timedOut = false;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			timedOut = true;
			proc.kill();
			reject(new Error(`CLI command timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	// Helper to read stream with timeout awareness
	async function readStream(
		stream: ReadableStream<Uint8Array>,
	): Promise<string> {
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];

		try {
			while (!timedOut) {
				// Use a short timeout for each read to allow checking timedOut flag
				const readPromise = reader.read();
				const timeoutCheck = new Promise<{ done: true; value: undefined }>(
					(resolve) => {
						const check = () => {
							if (timedOut) {
								resolve({ done: true, value: undefined });
							} else {
								setTimeout(check, 10);
							}
						};
						setTimeout(check, 10);
					},
				);

				const result = await Promise.race([readPromise, timeoutCheck]);

				if (result.done) {
					break;
				}

				if (result.value) {
					chunks.push(result.value);
				}
			}
		} catch (err) {
			// Stream error, likely due to process termination
		} finally {
			try {
				reader.releaseLock();
			} catch {
				// Ignore release errors
			}
		}

		// Concatenate chunks and decode
		if (chunks.length === 0) return "";
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		const result = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return new TextDecoder().decode(result);
	}

	// Read streams using custom reader
	const stdoutPromise = readStream(proc.stdout as ReadableStream<Uint8Array>);
	const stderrPromise = readStream(proc.stderr as ReadableStream<Uint8Array>);

	const resultPromise = Promise.all([
		stdoutPromise,
		stderrPromise,
		proc.exited,
	]);

	try {
		const [stdout, stderr, exitCode] = await Promise.race([
			resultPromise,
			timeoutPromise,
		]);

		if (timeoutId) clearTimeout(timeoutId);
		return { exitCode, stdout, stderr };
	} catch (error) {
		if (timeoutId) clearTimeout(timeoutId);
		throw error;
	}
}
