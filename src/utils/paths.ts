import { isAbsolute, relative, resolve } from "node:path";

/**
 * Validate output path is safe (no path traversal, within cwd)
 */
export function validateOutputPath(outputPath: string): string {
	const resolved = resolve(outputPath);
	const cwd = process.cwd();

	// Ensure path stays within current working directory
	const rel = relative(cwd, resolved);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(
			`Output path must be within current directory: ${outputPath}`,
		);
	}

	return resolved;
}
