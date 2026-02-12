import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	cleanupTestFiles,
	getTestOutputDir,
	resolveBunBinary,
	runCli,
} from "./cli";

const FIXTURE_ENTRY = "tests/fixtures/runcli-timeout-fixture.ts";

describe("runCli helper", () => {
	afterAll(() => {
		cleanupTestFiles(true);
	});

	it("uses explicit bun binary override when provided", () => {
		const resolved = resolveBunBinary({
			FALCON_TEST_BUN_BIN: "/tmp/custom-bun",
		});
		expect(resolved).toBe("/tmp/custom-bun");
	});

	it("retries once on launch timeout and succeeds", async () => {
		const result = await runCli(
			["--help"],
			{
				FALCON_TEST_CLI_ENTRY: FIXTURE_ENTRY,
				FALCON_TEST_RUNCLI_MODE: "timeout-once",
			},
			400,
		);
		expect(result.exitCode).toBe(0);
		expect(result.stderr).not.toContain("[runCli] process timeout exceeded");
	});

	it("does not retry when timeout includes child stderr output", async () => {
		const result = await runCli(
			["--help"],
			{
				FALCON_TEST_CLI_ENTRY: FIXTURE_ENTRY,
				FALCON_TEST_RUNCLI_MODE: "timeout-with-stderr",
			},
			400,
		);
		expect(result.exitCode).toBe(143);
		expect(result.stderr).toContain("fixture-timeout");
		expect(result.stderr).toContain("attempt=1/2");
	});

	it("returns timeout after retry exhaustion", async () => {
		const result = await runCli(
			["--help"],
			{
				FALCON_TEST_CLI_ENTRY: FIXTURE_ENTRY,
				FALCON_TEST_RUNCLI_MODE: "timeout-always",
			},
			400,
		);
		expect(result.exitCode).toBe(143);
		expect(result.stderr).toContain("[runCli] process timeout exceeded");
		expect(result.stderr).toContain("attempt=2/2");
	});

	it("cleanupTestFiles only removes helper-managed output directory", () => {
		const sentinel = join(process.cwd(), "falcon-helper-sentinel.png");
		writeFileSync(sentinel, "sentinel");
		try {
			cleanupTestFiles();
			expect(existsSync(sentinel)).toBe(true);
		} finally {
			rmSync(sentinel, { force: true });
		}
	});

	it("auto-injects output path for --up when --output is omitted", async () => {
		const result = await runCli(
			["tests/fixtures/tiny.png", "--up", "--no-open"],
			{
				FAL_KEY: "test-key",
			},
			30000,
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(getTestOutputDir());
	});
});
