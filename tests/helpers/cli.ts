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

export async function runCli(
	args: string[],
	envOverrides: Record<string, string> = {},
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
			...envOverrides,
		},
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout as ReadableStream).text(),
		new Response(proc.stderr as ReadableStream).text(),
		proc.exited,
	]);

	return { exitCode, stdout, stderr };
}
