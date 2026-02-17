import "../helpers/env";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { withMockFetch } from "../helpers/fetch";
import { importWithTimeoutRetry } from "../helpers/import";

const {
	deleteTempFile,
	downloadImage,
	generateFilename,
	getFileSize,
	getImageDimensions,
	imageToDataUrl,
	openImage,
	resizeImage,
} = await importWithTimeoutRetry(() => import("../../src/utils/image"), {
	label: "utils/image import (image.test)",
});

describe("image utils", () => {
	it("generates a timestamped filename", () => {
		const name = generateFilename("falcon", "webp");
		expect(name.startsWith("falcon-")).toBe(true);
		expect(name.endsWith(".webp")).toBe(true);
	});

	it("converts png files to data URLs", async () => {
		const fixturePath = join(process.cwd(), "tests", "fixtures", "tiny.png");
		const dataUrl = await imageToDataUrl(fixturePath);
		expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
	});

	it("throws for missing image path", async () => {
		await expect(imageToDataUrl("/missing.png")).rejects.toThrow(
			"Image not found"
		);
	});

	it("deleteTempFile ignores non-temp paths", () => {
		const path = join(process.cwd(), "tests", "fixtures", "tiny.png");
		expect(() => deleteTempFile(path)).not.toThrow();
	});

	it("deleteTempFile removes temp files safely", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "falcon-test-"));
		const tempPath = join(tempDir, "falcon-test-temp.png");
		writeFileSync(tempPath, "temp");
		try {
			deleteTempFile(tempPath);
			expect(existsSync(tempPath)).toBe(false);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe("downloadImage", () => {
	let tempDir: string;
	let savedFixture: string | undefined;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "falcon-dl-test-"));
		savedFixture = process.env.FALCON_DOWNLOAD_FIXTURE;
	});

	afterEach(() => {
		if (savedFixture === undefined) {
			process.env.FALCON_DOWNLOAD_FIXTURE = undefined;
		} else {
			process.env.FALCON_DOWNLOAD_FIXTURE = savedFixture;
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("copies fixture file to output path when FALCON_DOWNLOAD_FIXTURE is set", async () => {
		const fixturePath = join(process.cwd(), "tests", "fixtures", "tiny.png");
		const outputPath = join(tempDir, "downloaded.png");
		process.env.FALCON_DOWNLOAD_FIXTURE = fixturePath;

		await downloadImage("https://example.com/image.png", outputPath);

		expect(existsSync(outputPath)).toBe(true);
		const original = readFileSync(fixturePath);
		const copied = readFileSync(outputPath);
		expect(copied.equals(original)).toBe(true);
	});

	it("throws when FALCON_DOWNLOAD_FIXTURE points to nonexistent file", async () => {
		process.env.FALCON_DOWNLOAD_FIXTURE = "/nonexistent/path/fake.png";
		const outputPath = join(tempDir, "output.png");

		await expect(
			downloadImage("https://example.com/image.png", outputPath)
		).rejects.toThrow();
	});

	it("writes response body to output path on successful fetch", async () => {
		process.env.FALCON_DOWNLOAD_FIXTURE = undefined;
		const outputPath = join(tempDir, "fetched.png");
		const fakeContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

		await withMockFetch(
			() => new Response(fakeContent, { status: 200 }),
			async () => {
				await downloadImage("https://example.com/image.png", outputPath);
			}
		);

		expect(existsSync(outputPath)).toBe(true);
		const written = readFileSync(outputPath);
		expect(new Uint8Array(written)).toEqual(fakeContent);
	});

	it("throws on non-OK response with status text", async () => {
		process.env.FALCON_DOWNLOAD_FIXTURE = undefined;
		const outputPath = join(tempDir, "fail.png");

		await expect(
			withMockFetch(
				() => new Response(null, { status: 404, statusText: "Not Found" }),
				async () => {
					await downloadImage("https://example.com/missing.png", outputPath);
				}
			)
		).rejects.toThrow("Not Found");
	});
});

describe("imageToDataUrl — MIME types", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "falcon-mime-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns image/jpeg MIME for JPEG magic bytes", async () => {
		const filePath = join(tempDir, "test.jpg");
		writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
		const dataUrl = await imageToDataUrl(filePath);
		expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
	});

	it("returns image/webp MIME for RIFF magic bytes", async () => {
		const filePath = join(tempDir, "test.webp");
		writeFileSync(filePath, Buffer.from([0x52, 0x49, 0x46, 0x46]));
		const dataUrl = await imageToDataUrl(filePath);
		expect(dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
	});

	it("falls back to image/png when bytes do not match JPEG/WEBP signatures", async () => {
		const filePath = join(tempDir, "test.png");
		writeFileSync(filePath, Buffer.from([0x00, 0x11, 0x22, 0x33]));
		const dataUrl = await imageToDataUrl(filePath);
		expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
	});

	it("uses byte signatures even when extension is misleading", async () => {
		const filePath = join(tempDir, "misleading.png");
		writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
		const dataUrl = await imageToDataUrl(filePath);
		expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
	});

	it("property: MIME type follows bytes, not extension", async () => {
		const signatures = [
			{
				mime: "image/jpeg",
				header: Uint8Array.from([0xff, 0xd8, 0x00, 0x00]),
			},
			{
				mime: "image/webp",
				header: Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
			},
			{
				mime: "image/png",
				header: Uint8Array.from([0x11, 0x22, 0x33, 0x44]),
			},
		] as const;

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(".png", ".jpg", ".jpeg", ".webp"),
				fc.constantFrom(...signatures),
				fc.uint8Array({ minLength: 0, maxLength: 60 }),
				async (ext, signature, tail) => {
					const filePath = join(tempDir, `prop-test${ext}`);
					writeFileSync(filePath, Buffer.concat([signature.header, tail]));
					try {
						const dataUrl = await imageToDataUrl(filePath);
						expect(dataUrl.startsWith(`data:${signature.mime};base64,`)).toBe(
							true
						);
					} finally {
						rmSync(filePath, { force: true });
					}
				}
			),
			{ numRuns: 50 }
		);
	});
});

describe("getImageDimensions", () => {
	it("returns dimensions or null for tiny.png fixture", async () => {
		const fixturePath = join(process.cwd(), "tests", "fixtures", "tiny.png");
		const result = await getImageDimensions(fixturePath);
		// Platform-dependent: `file` command may or may not report dimensions
		if (result !== null) {
			expect(result).toHaveProperty("width");
			expect(result).toHaveProperty("height");
			expect(typeof result.width).toBe("number");
			expect(typeof result.height).toBe("number");
		} else {
			expect(result).toBeNull();
		}
	});
});

describe("getFileSize", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "falcon-size-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns B suffix for files smaller than 1KB", () => {
		const filePath = join(tempDir, "small.bin");
		writeFileSync(filePath, Buffer.alloc(100));
		const size = getFileSize(filePath);
		expect(size).toEndWith("B");
		expect(size).not.toEndWith("KB");
		expect(size).not.toEndWith("MB");
	});

	it("returns KB suffix for files between 1KB and 1MB", () => {
		const filePath = join(tempDir, "medium.bin");
		writeFileSync(filePath, Buffer.alloc(2048));
		const size = getFileSize(filePath);
		expect(size).toEndWith("KB");
	});

	it("returns MB suffix for files 1MB or larger", () => {
		const filePath = join(tempDir, "large.bin");
		writeFileSync(filePath, Buffer.alloc(1024 * 1024 + 1));
		const size = getFileSize(filePath);
		expect(size).toEndWith("MB");
	});

	// Feature: phase5-config-integration-tests, Property 5: getFileSize suffix correctness
	// **Validates: Requirements 7.2, 7.3, 7.4**
	it("property: suffix matches byte size thresholds", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 2 * 1024 * 1024 }), (byteSize) => {
				const filePath = join(tempDir, `prop-${byteSize}.bin`);
				writeFileSync(filePath, Buffer.alloc(byteSize));
				try {
					const result = getFileSize(filePath);
					if (byteSize < 1024) {
						expect(result).toEndWith("B");
						expect(result).not.toContain("KB");
						expect(result).not.toContain("MB");
					} else if (byteSize < 1024 * 1024) {
						expect(result).toEndWith("KB");
					} else {
						expect(result).toEndWith("MB");
					}
				} finally {
					rmSync(filePath, { force: true });
				}
			}),
			{ numRuns: 50 }
		);
	});
});

describe("openImage", () => {
	let savedTestMode: string | undefined;

	beforeEach(() => {
		savedTestMode = process.env.FALCON_TEST_MODE;
	});

	afterEach(() => {
		if (savedTestMode === undefined) {
			process.env.FALCON_TEST_MODE = undefined;
		} else {
			process.env.FALCON_TEST_MODE = savedTestMode;
		}
	});

	it("skips open operation when FALCON_TEST_MODE is set", () => {
		process.env.FALCON_TEST_MODE = "1";
		const fixturePath = join(process.cwd(), "tests", "fixtures", "tiny.png");
		// Should return without error and without spawning a process
		expect(() => openImage(fixturePath)).not.toThrow();
	});

	it("throws for nonexistent file path", () => {
		process.env.FALCON_TEST_MODE = undefined;
		expect(() => openImage("/nonexistent/image.png")).toThrow(
			"Image not found"
		);
	});
});

describe("resizeImage", () => {
	if (process.platform === "darwin") {
		it("returns a path when resizing on macOS", async () => {
			const fixturePath = join(process.cwd(), "tests", "fixtures", "tiny.png");
			const result = await resizeImage(fixturePath, 512);
			expect(typeof result).toBe("string");
			expect(existsSync(result)).toBe(true);
			// Clean up temp file if it was created
			if (result !== fixturePath) {
				rmSync(result, { force: true });
			}
		});
	}

	it("returns original path as fallback when sips is unavailable", async () => {
		// On non-macOS (Linux CI), sips won't exist, so it should fall back
		if (process.platform !== "darwin") {
			const fixturePath = join(process.cwd(), "tests", "fixtures", "tiny.png");
			const result = await resizeImage(fixturePath, 512);
			expect(result).toBe(fixturePath);
		}
	});
});
