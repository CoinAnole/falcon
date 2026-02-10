import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, resolve } from "node:path";

/**
 * Download an image from a URL and save it to a file
 */
export async function downloadImage(
	url: string,
	outputPath: string,
): Promise<void> {
	// Support fixture-based testing: copy a local file instead of fetching from URL
	const downloadFixture = process.env.FALCON_DOWNLOAD_FIXTURE;
	if (downloadFixture) {
		if (process.env.FALCON_CLI_TEST_DEBUG === "1") {
			console.error(
				`[image] fixture:download ${JSON.stringify({
					from: downloadFixture,
					to: outputPath,
				})}`,
			);
		}
		try {
			const { copyFileSync } = await import("node:fs");
			copyFileSync(downloadFixture, outputPath);
		} catch (error) {
			if (process.env.FALCON_CLI_TEST_DEBUG === "1") {
				console.error(
					`[image] fixture:download:error ${JSON.stringify({
						error: error instanceof Error ? error.message : String(error),
						from: downloadFixture,
						to: outputPath,
					})}`,
				);
			}
			throw error;
		}
		return;
	}

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.statusText}`);
	}

	const buffer = await response.arrayBuffer();
	await Bun.write(outputPath, buffer);
}

/**
 * Convert a local image file to a base64 data URL
 */
export async function imageToDataUrl(imagePath: string): Promise<string> {
	if (!existsSync(imagePath)) {
		throw new Error(`Image not found: ${imagePath}`);
	}

	const file = Bun.file(imagePath);
	const buffer = await file.arrayBuffer();
	const base64 = Buffer.from(buffer).toString("base64");

	const ext = extname(imagePath).toLowerCase();
	let mimeType = "image/png";
	if (ext === ".jpg" || ext === ".jpeg") {
		mimeType = "image/jpeg";
	} else if (ext === ".webp") {
		mimeType = "image/webp";
	}

	return `data:${mimeType};base64,${base64}`;
}

/**
 * Resize an image using sips (macOS) or sharp
 * Returns the path to the resized image (temp file if resized)
 */
export async function resizeImage(
	imagePath: string,
	maxSize: number = 1024,
): Promise<string> {
	// Use cryptographically random UUID for temp file to prevent race conditions
	const tempPath = `${tmpdir()}/falcon-resize-${randomUUID()}.png`;

	// Try sips first (macOS)
	try {
		const proc = Bun.spawn(
			["sips", "-Z", String(maxSize), imagePath, "--out", tempPath],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		await proc.exited;

		if (proc.exitCode === 0 && existsSync(tempPath)) {
			return tempPath;
		}
	} catch {
		// sips not available, fall through
	}

	// If sips fails, just use the original
	return imagePath;
}

/**
 * Get image dimensions from a file
 */
export async function getImageDimensions(
	imagePath: string,
): Promise<{ width: number; height: number } | null> {
	try {
		// Try using file command to get dimensions
		const proc = Bun.spawn(["file", imagePath], {
			stdout: "pipe",
		});

		const output = await new Response(proc.stdout).text();
		const match = output.match(/(\d+)\s*x\s*(\d+)/);

		if (match) {
			return {
				width: parseInt(match[1], 10),
				height: parseInt(match[2], 10),
			};
		}
	} catch {
		// Ignore errors
	}

	return null;
}

/**
 * Get file size in human-readable format
 */
export async function getFileSize(filePath: string): Promise<string> {
	const file = Bun.file(filePath);
	const bytes = file.size;

	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Generate a timestamped filename
 */
export function generateFilename(
	prefix: string = "falcon",
	format: string = "png",
): string {
	const now = new Date();
	const timestamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, "");
	return `${prefix}-${timestamp}.${format}`;
}

/**
 * Open an image in Preview
 * Uses 'open' command for a clean experience without debug output
 */
export async function openImage(imagePath: string): Promise<void> {
	// Validate the path exists to provide better error messages
	if (!existsSync(imagePath)) {
		throw new Error(`Image not found: ${imagePath}`);
	}

	const absolutePath = resolve(imagePath);
	const debugEnabled = process.env.FALCON_CLI_TEST_DEBUG === "1";
	const debugLog = (message: string, meta?: Record<string, unknown>) => {
		if (!debugEnabled) return;
		const payload = meta ? ` ${JSON.stringify(meta)}` : "";
		console.error(`[openImage] ${message}${payload}`);
	};

	// Skip opening in test environment to avoid dangling processes
	if (process.env.FALCON_TEST_MODE) {
		debugLog("skipped", { reason: "FALCON_TEST_MODE", absolutePath });
		return;
	}

	if (process.platform === "darwin") {
		// Use 'open' command - cleaner than qlmanage (no debug output)
		debugLog("spawn", { platform: process.platform, command: "open" });
		const proc = Bun.spawn(["open", absolutePath], {
			stdout: "ignore",
			stderr: "ignore",
		});
		// Don't await - let it run detached
		proc.unref?.();
	} else if (process.platform === "linux") {
		debugLog("spawn", { platform: process.platform, command: "xdg-open" });
		const proc = Bun.spawn(["xdg-open", absolutePath], {
			stdout: "ignore",
			stderr: "ignore",
		});
		// Don't await - let it run detached
		proc.unref?.();
	}
}

/**
 * Delete a temporary file safely
 */
export function deleteTempFile(filePath: string): void {
	try {
		if (filePath.includes("falcon-") && existsSync(filePath)) {
			unlinkSync(filePath);
		}
	} catch {
		// Ignore cleanup errors
	}
}
