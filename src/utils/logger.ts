/**
 * Logging utility for Falcon
 *
 * Logs to OS temp directory (e.g., /tmp/falcon-debug.log on Unix) when FALCON_DEBUG=1 is set
 * Levels: debug < info < warn < error
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

// Log file path - using OS temp directory for persistence after app exit
const LOG_FILE = join(tmpdir(), "falcon-debug.log");

// Check if logging is enabled via environment variable
function isLoggingEnabled(): boolean {
	return (
		process.env.FALCON_DEBUG === "1" || process.env.FALCON_DEBUG === "true"
	);
}

// Get current log level from environment (default to debug)
function getLogLevel(): LogLevel {
	const envLevel = process.env.FALCON_LOG_LEVEL as LogLevel | undefined;
	if (envLevel && envLevel in LOG_LEVELS) {
		return envLevel;
	}
	return "debug";
}

// Ensure log directory exists
function ensureLogDirectory(): void {
	const dir = dirname(LOG_FILE);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

// Format timestamp as ISO 8601
function formatTimestamp(): string {
	return new Date().toISOString();
}

// Format log entry
function formatLogEntry(
	level: LogLevel,
	message: string,
	meta?: Record<string, unknown>
): string {
	const timestamp = formatTimestamp();
	let entry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

	if (meta && Object.keys(meta).length > 0) {
		// Sanitize meta to remove sensitive data
		const sanitized = sanitizeMeta(meta);
		try {
			entry += ` ${JSON.stringify(sanitized)}`;
		} catch {
			entry += " [meta serialization failed]";
		}
	}

	return `${entry}\n`;
}

// Sanitize metadata to remove sensitive information
function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(meta)) {
		// Skip API keys and authorization headers
		if (
			key.toLowerCase().includes("apikey") ||
			key.toLowerCase().includes("api_key") ||
			key.toLowerCase().includes("authorization") ||
			key.toLowerCase().includes("auth")
		) {
			sanitized[key] = "[REDACTED]";
		} else if (typeof value === "object" && value !== null) {
			sanitized[key] = sanitizeMeta(value as Record<string, unknown>);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

// Write to log file
function writeToLog(entry: string, synchronous = false): void {
	if (!isLoggingEnabled()) {
		return;
	}

	try {
		ensureLogDirectory();

		if (synchronous) {
			// Synchronous write for errors - ensures log is written before potential crash
			appendFileSync(LOG_FILE, entry);
		} else {
			// Async write for non-critical logs
			void (async () => {
				try {
					const fs = await import("node:fs/promises");
					await fs.appendFile(LOG_FILE, entry);
				} catch {
					// Silent fail - logging should never break the app
				}
			})();
		}
	} catch {
		// Silent fail - logging should never break the app
	}
}

// Clear log file (useful for fresh session)
export function clearLog(): void {
	if (!isLoggingEnabled()) {
		return;
	}

	try {
		ensureLogDirectory();
		writeFileSync(LOG_FILE, "");
	} catch {
		// Silent fail
	}
}

// Get log file path
export function getLogPath(): string {
	return LOG_FILE;
}

// Check if logging is enabled
export function isEnabled(): boolean {
	return isLoggingEnabled();
}

// Core logging function
function log(
	level: LogLevel,
	message: string,
	meta?: Record<string, unknown>
): void {
	const currentLevel = getLogLevel();

	// Only log if level is >= current threshold
	if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
		return;
	}

	const entry = formatLogEntry(level, message, meta);
	// Use synchronous writes for errors and warnings
	const synchronous = level === "error" || level === "warn";
	writeToLog(entry, synchronous);
}

// Public API
export const logger = {
	debug(message: string, meta?: Record<string, unknown>): void {
		log("debug", message, meta);
	},

	info(message: string, meta?: Record<string, unknown>): void {
		log("info", message, meta);
	},

	warn(message: string, meta?: Record<string, unknown>): void {
		log("warn", message, meta);
	},

	error(message: string, meta?: Record<string, unknown>): void {
		log("error", message, meta);
	},

	// Log an error object with stack trace
	errorWithStack(
		message: string,
		error: Error,
		meta?: Record<string, unknown>
	): void {
		const errorMeta = {
			...meta,
			errorName: error.name,
			errorMessage: error.message,
			stack: error.stack,
		};
		log("error", message, errorMeta);
	},
};

// Convenience exports
export const debug = logger.debug;
export const info = logger.info;
export const warn = logger.warn;
export const error = logger.error;
export const errorWithStack = logger.errorWithStack;
