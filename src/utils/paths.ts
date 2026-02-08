import { existsSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

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
