import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";
import {
	buildIndexedOutputPath,
	isPathWithinCwd,
	normalizeOutputPath,
	validateImagePath,
	validateOutputPath,
} from "../../src/utils/paths";

// Temp directory for validateImagePath tests
let tempDir: string;

beforeAll(() => {
	tempDir = mkdtempSync(join(tmpdir(), "falcon-paths-test-"));
	writeFileSync(join(tempDir, "image.png"), "fake-png");
	writeFileSync(join(tempDir, "image.jpg"), "fake-jpg");
	writeFileSync(join(tempDir, "image.jpeg"), "fake-jpeg");
	writeFileSync(join(tempDir, "image.webp"), "fake-webp");
	writeFileSync(join(tempDir, "image.gif"), "fake-gif");
	writeFileSync(join(tempDir, "notes.txt"), "fake-txt");
});

afterAll(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

// --- 1.1 validateOutputPath ---

describe("validateOutputPath", () => {
	it("returns resolved absolute path for a path within CWD", () => {
		const result = validateOutputPath("output.png");
		expect(result).toBe(resolve("output.png"));
	});

	it("throws for path traversal outside CWD", () => {
		expect(() => validateOutputPath("../secret")).toThrow(
			"Output path must be within current directory"
		);
	});
});

// --- 1.2 normalizeOutputPath ---

describe("normalizeOutputPath", () => {
	it("replaces existing extension with target extension", () => {
		const result = normalizeOutputPath("photo.jpg", "png");
		expect(result).toBe(resolve("photo.png"));
	});

	it("appends extension when path has none", () => {
		const result = normalizeOutputPath("photo", "webp");
		expect(result).toBe(resolve("photo.webp"));
	});

	it("throws for path traversal", () => {
		expect(() => normalizeOutputPath("../escape", "png")).toThrow(
			"Output path must be within current directory"
		);
	});
});

// --- 1.3 buildIndexedOutputPath ---

describe("buildIndexedOutputPath", () => {
	it("returns original path when index is 0", () => {
		expect(buildIndexedOutputPath("out.png", 0, "png")).toBe("out.png");
	});

	it("appends index+1 for positive index", () => {
		expect(buildIndexedOutputPath("out.png", 1, "png")).toBe("out-2.png");
		expect(buildIndexedOutputPath("out.png", 2, "png")).toBe("out-3.png");
	});

	it("preserves directory component", () => {
		expect(buildIndexedOutputPath("subdir/out.png", 1, "png")).toBe(
			join("subdir", "out-2.png")
		);
	});
});

// --- 1.4 isPathWithinCwd ---

describe("isPathWithinCwd", () => {
	it("returns true for path within CWD", () => {
		expect(isPathWithinCwd("file.txt")).toBe(true);
		expect(isPathWithinCwd("sub/file.txt")).toBe(true);
	});

	it("returns false for path outside CWD", () => {
		expect(isPathWithinCwd("../outside")).toBe(false);
		expect(isPathWithinCwd("/tmp")).toBe(false);
	});
});

// --- 1.5 validateImagePath ---

describe("validateImagePath", () => {
	it("returns resolved path for valid image extensions", () => {
		for (const ext of ["png", "jpg", "jpeg", "webp"]) {
			const result = validateImagePath(join(tempDir, `image.${ext}`));
			expect(result).toBe(resolve(join(tempDir, `image.${ext}`)));
		}
	});

	it("throws for nonexistent file", () => {
		expect(() => validateImagePath(join(tempDir, "nope.png"))).toThrow(
			"Edit image not found"
		);
	});

	it("throws for unsupported extension", () => {
		expect(() => validateImagePath(join(tempDir, "image.gif"))).toThrow(
			"Edit image must be PNG, JPG, or WebP"
		);
		expect(() => validateImagePath(join(tempDir, "notes.txt"))).toThrow(
			"Edit image must be PNG, JPG, or WebP"
		);
	});
});

// --- 1.6 Property 1: Path containment correctness ---

describe("property tests", () => {
	// Feature: phase1-pure-utility-tests, Property 1: Path containment correctness
	/**
	 * Validates: Requirements 1.8, 1.9
	 */
	it("Property 1: isPathWithinCwd returns true for relative paths not starting with '..'", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom("a", "b", "c", "d", "1"), {
					minLength: 1,
					maxLength: 20,
				}),
				(chars) => {
					const path = chars.join("");
					expect(isPathWithinCwd(path)).toBe(true);
				}
			),
			{ numRuns: 50 }
		);
	});

	/**
	 * Validates: Requirements 1.8, 1.9
	 */
	it("Property 1: isPathWithinCwd returns false for paths starting with '../'", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom("a", "b", "c", "1"), {
					minLength: 1,
					maxLength: 10,
				}),
				(chars) => {
					const suffix = chars.join("");
					expect(isPathWithinCwd(`../${suffix}`)).toBe(false);
				}
			),
			{ numRuns: 50 }
		);
	});

	// Feature: phase1-pure-utility-tests, Property 2: buildIndexedOutputPath index 0 is identity
	/**
	 * Validates: Requirements 1.5
	 */
	it("Property 2: buildIndexedOutputPath with index 0 returns original path", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom("a", "b", ".", "-", "_"), {
					minLength: 1,
					maxLength: 20,
				}),
				fc.constantFrom("png", "jpg", "webp"),
				(chars, ext) => {
					const path = chars.join("");
					expect(buildIndexedOutputPath(path, 0, ext)).toBe(path);
				}
			),
			{ numRuns: 50 }
		);
	});

	// Feature: phase1-pure-utility-tests, Property 3: buildIndexedOutputPath positive index naming convention
	/**
	 * Validates: Requirements 1.6
	 */
	it("Property 3: buildIndexedOutputPath positive index produces '-{index+1}.{ext}' suffix", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("out.png", "photo.jpg", "img.webp"),
				fc.integer({ min: 1, max: 100 }),
				fc.constantFrom("png", "jpg", "webp"),
				(path, index, ext) => {
					const result = buildIndexedOutputPath(path, index, ext);
					expect(result).toContain(`-${index + 1}.${ext}`);
				}
			),
			{ numRuns: 50 }
		);
	});
});
