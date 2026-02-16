import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshFalconPaths } from "../../src/utils/config";

const globalKey = "__FALCON_TEST_HOME__";
const globalStore = globalThis as unknown as Record<string, string | undefined>;
const existingHome = globalStore[globalKey];
const testHome = existingHome ?? mkdtempSync(join(tmpdir(), "falcon-test-"));

if (!existingHome) {
	(globalStore as Record<string, string>)[globalKey] = testHome;
}

process.env.HOME = testHome;
// Refresh config paths in case src/utils/config was loaded before HOME override.
refreshFalconPaths();

export function getTestHome(): string {
	return testHome;
}
