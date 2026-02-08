import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const globalKey = "__FALCON_TEST_HOME__";
const globalStore = globalThis as unknown as Record<string, string | undefined>;
const existingHome = globalStore[globalKey];
const testHome = existingHome ?? mkdtempSync(join(tmpdir(), "falcon-test-"));

if (!existingHome) {
	(globalStore as Record<string, string>)[globalKey] = testHome;
}

process.env.HOME = testHome;

export function getTestHome(): string {
	return testHome;
}
