import { existsSync } from "node:fs";
import { extname, isAbsolute, join, parse, relative, resolve } from "node:path";

/**
 * Validate output path is safe (no path traversal, within cwd)
 */
export function validateOutputPath(outputPath: string): string {
	const resolved = resolve(outputPath);
	if (!isPathWithinCwd(resolved)) {
		throw new Error(
			`Output path must be within current directory: ${outputPath}`,
		);
	}

	return resolved;
}

/**
 * Normalize an output path to ensure it ends with the expected extension.
 */
export function normalizeOutputPath(
	outputPath: string,
	fileExt: string,
): string {
	const currentExt = extname(outputPath);
	const basePath = currentExt
		? outputPath.slice(0, -currentExt.length)
		: outputPath;
	return validateOutputPath(`${basePath}.${fileExt}`);
}

/**
 * Build an indexed filename for multi-image outputs.
 */
export function buildIndexedOutputPath(
	outputPath: string,
	index: number,
	fileExt: string,
): string {
	if (index === 0) return outputPath;
	const { dir, name } = parse(outputPath);
	const filename = `${name}-${index + 1}.${fileExt}`;
	return dir ? join(dir, filename) : filename;
}

/**
 * Check if a path resolves within the current working directory.
 */
export function isPathWithinCwd(targetPath: string): boolean {
	const resolved = resolve(targetPath);
	const cwd = process.cwd();
	const rel = relative(cwd, resolved);
	return !(rel.startsWith("..") || isAbsolute(rel));
}

/**
 * Validate an existing image path and allowed extensions.
 */
export function validateImagePath(imagePath: string): string {
	const resolved = resolve(imagePath);

	if (!existsSync(resolved)) {
		throw new Error(`Edit image not found: ${imagePath}`);
	}

	const ext = extname(resolved).toLowerCase();
	if (ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg" && ext !== ".webp") {
		throw new Error(`Edit image must be PNG, JPG, or WebP: ${imagePath}`);
	}

	return resolved;
}
