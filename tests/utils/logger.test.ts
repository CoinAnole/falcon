import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { importWithTimeoutRetry } from "../helpers/import";

const { clearLog, errorWithStack, getLogPath, isEnabled, logger } =
	await importWithTimeoutRetry(() => import("../../src/utils/logger"), {
		label: "utils/logger import (logger.test)",
	});

// Save/restore env vars for isolation
let savedDebug: string | undefined;
let savedLogLevel: string | undefined;
const SAFE_VALUE_REGEX = /^safeVal_[a-z0-9]{3,10}$/;
const SENSITIVE_VALUE_REGEX = /^secret_[a-z0-9]{3,10}$/;

beforeEach(() => {
	savedDebug = process.env.FALCON_DEBUG;
	savedLogLevel = process.env.FALCON_LOG_LEVEL;
});

afterEach(() => {
	if (savedDebug === undefined) {
		process.env.FALCON_DEBUG = undefined;
	} else {
		process.env.FALCON_DEBUG = savedDebug;
	}
	if (savedLogLevel === undefined) {
		process.env.FALCON_LOG_LEVEL = undefined;
	} else {
		process.env.FALCON_LOG_LEVEL = savedLogLevel;
	}
});

/** Helper: read the log file contents, returns empty string if missing */
function readLog(): string {
	const p = getLogPath();
	return existsSync(p) ? readFileSync(p, "utf-8") : "";
}

/** Helper: small delay to let async log writes flush */
function tick(ms = 50): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

// --- 2.1 isEnabled and getLogPath ---

describe("isEnabled", () => {
	it("returns true when FALCON_DEBUG is '1'", () => {
		process.env.FALCON_DEBUG = "1";
		expect(isEnabled()).toBe(true);
	});

	it("returns true when FALCON_DEBUG is 'true'", () => {
		process.env.FALCON_DEBUG = "true";
		expect(isEnabled()).toBe(true);
	});

	it("returns false when FALCON_DEBUG is unset", () => {
		process.env.FALCON_DEBUG = undefined;
		expect(isEnabled()).toBe(false);
	});

	it("returns false when FALCON_DEBUG is '0'", () => {
		process.env.FALCON_DEBUG = "0";
		expect(isEnabled()).toBe(false);
	});
});

describe("getLogPath", () => {
	it("returns a path ending with 'falcon-debug.log' in the OS temp directory", () => {
		const logPath = getLogPath();
		expect(logPath).toBe(join(tmpdir(), "falcon-debug.log"));
	});
});

// --- 2.2 Log writing ---

describe("log writing", () => {
	it("writes messages to log file when enabled", () => {
		process.env.FALCON_DEBUG = "1";
		process.env.FALCON_LOG_LEVEL = undefined;
		clearLog();

		logger.warn("test-write-message");
		// warn is synchronous, so no tick needed
		const content = readLog();
		expect(content).toContain("test-write-message");
		expect(content).toContain("[WARN]");
	});

	it("does not write when logging is disabled", async () => {
		process.env.FALCON_DEBUG = undefined;
		// Clear any existing content first while enabled
		process.env.FALCON_DEBUG = "1";
		clearLog();
		const before = readLog();
		process.env.FALCON_DEBUG = undefined;

		logger.warn("should-not-appear");
		await tick();
		const after = readLog();
		expect(after).toBe(before);
	});
});

// --- 2.3 Log level filtering ---

describe("log level filtering", () => {
	it("FALCON_LOG_LEVEL=error filters out debug, info, and warn", async () => {
		process.env.FALCON_DEBUG = "1";
		process.env.FALCON_LOG_LEVEL = "error";
		clearLog();

		// debug and info are async writes
		logger.debug("dbg-msg");
		logger.info("info-msg");
		// warn is sync
		logger.warn("warn-msg");
		await tick();

		const content = readLog();
		expect(content).not.toContain("dbg-msg");
		expect(content).not.toContain("info-msg");
		expect(content).not.toContain("warn-msg");
	});

	it("FALCON_LOG_LEVEL=warn filters debug and info but keeps warn and error", async () => {
		process.env.FALCON_DEBUG = "1";
		process.env.FALCON_LOG_LEVEL = "warn";
		clearLog();

		logger.debug("dbg-msg");
		logger.info("info-msg");
		logger.warn("warn-msg");
		logger.error("err-msg");
		await tick();

		const content = readLog();
		expect(content).not.toContain("dbg-msg");
		expect(content).not.toContain("info-msg");
		expect(content).toContain("warn-msg");
		expect(content).toContain("err-msg");
	});
});

// --- 2.4 clearLog and errorWithStack ---

describe("clearLog", () => {
	it("empties the log file", () => {
		process.env.FALCON_DEBUG = "1";
		process.env.FALCON_LOG_LEVEL = undefined;
		logger.error("some content");
		expect(readLog().length).toBeGreaterThan(0);

		clearLog();
		expect(readLog()).toBe("");
	});
});

describe("errorWithStack", () => {
	it("includes error name, message, and stack in the log entry", () => {
		process.env.FALCON_DEBUG = "1";
		process.env.FALCON_LOG_LEVEL = undefined;
		clearLog();

		const err = new TypeError("something broke");
		errorWithStack("operation failed", err);

		const content = readLog();
		expect(content).toContain("operation failed");
		expect(content).toContain("TypeError");
		expect(content).toContain("something broke");
		expect(content).toContain("stack");
	});
});

// --- 2.5 Property 4: Logger sanitization preserves safe keys and redacts sensitive keys ---

describe("property tests", () => {
	// Feature: phase1-pure-utility-tests, Property 4: Logger sanitization preserves safe keys and redacts sensitive keys
	/**
	 * Validates: Requirements 2.3, 2.4, 2.5
	 *
	 * We test sanitization indirectly by logging metadata and checking the output.
	 * Sensitive keys (containing apikey, api_key, authorization, auth) should be
	 * replaced with [REDACTED]. Safe keys should be preserved.
	 */
	it("Property 4: sanitization redacts sensitive keys and preserves safe keys", () => {
		const sensitiveKeys = [
			"apikey",
			"api_key",
			"authorization",
			"auth",
			"myApiKey",
			"X_AUTH_token",
		];
		const safeKeys = ["model", "prompt", "count", "name", "url"];

		// Use alphanumeric strings with a unique prefix to avoid collisions with log formatting
		const safeValueArb = fc.stringMatching(SAFE_VALUE_REGEX);
		const sensitiveValueArb = fc.stringMatching(SENSITIVE_VALUE_REGEX);

		fc.assert(
			fc.property(
				fc.constantFrom(...sensitiveKeys),
				fc.constantFrom(...safeKeys),
				sensitiveValueArb,
				safeValueArb,
				(sensitiveKey, safeKey, sensitiveVal, safeVal) => {
					process.env.FALCON_DEBUG = "1";
					process.env.FALCON_LOG_LEVEL = undefined;
					clearLog();

					const meta: Record<string, unknown> = {
						[safeKey]: safeVal,
						[sensitiveKey]: sensitiveVal,
					};

					// Use error (synchronous write) so we can read immediately
					logger.error("prop-test", meta);

					const content = readLog();
					// Sensitive value should be redacted
					expect(content).toContain("[REDACTED]");
					// Safe value should be preserved
					expect(content).toContain(safeVal);
					// The sensitive raw value should NOT appear
					expect(content).not.toContain(sensitiveVal);
				}
			),
			{ numRuns: 50 }
		);
	});

	/**
	 * Validates: Requirements 2.4 (nested objects)
	 */
	it("Property 4: sanitization recursively redacts nested sensitive keys", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("apikey", "api_key", "authorization", "auth"),
				fc.string({ minLength: 1, maxLength: 20 }),
				(sensitiveKey, secretValue) => {
					process.env.FALCON_DEBUG = "1";
					process.env.FALCON_LOG_LEVEL = undefined;
					clearLog();

					const meta = {
						outer: "safe-value",
						nested: {
							[sensitiveKey]: secretValue,
							keep: "visible",
						},
					};

					logger.error("nested-test", meta);

					const content = readLog();
					expect(content).toContain("[REDACTED]");
					expect(content).toContain("visible");
					expect(content).toContain("safe-value");
				}
			),
			{ numRuns: 50 }
		);
	});
});
