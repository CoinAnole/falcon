import "../helpers/env";

import { describe, expect, it } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	deleteTempFile,
	generateFilename,
	imageToDataUrl,
} from "../../src/utils/image";

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
			"Image not found",
		);
	});

	it("deleteTempFile ignores non-temp paths", () => {
		const path = join(process.cwd(), "tests", "fixtures", "tiny.png");
		expect(() => deleteTempFile(path)).not.toThrow();
	});

	it("deleteTempFile removes temp files safely", () => {
		const tempPath = "/tmp/falcon-test-temp.png";
		writeFileSync(tempPath, "temp");
		deleteTempFile(tempPath);
		expect(existsSync(tempPath)).toBe(false);
	});
});
