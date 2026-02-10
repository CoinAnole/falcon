#!/usr/bin/env bun
/**
 * Flaky Test Detector
 * Runs the full test suite up to 10 times with debugging enabled,
 * capturing output of failing tests to files for analysis.
 */

import { spawn } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const MAX_RUNS = 10;
const OUTPUT_DIR = "test-runs";

interface RunResult {
	runNumber: number;
	passed: boolean;
	exitCode: number;
	logContent: string;
	failLogPath?: string;
}

async function runTests(runNumber: number, runDir: string): Promise<RunResult> {
	const runLogPath = join(runDir, `run_${runNumber}.log`);
	const failLogPath = join(runDir, `run_${runNumber}_failures.log`);

	console.log(`\n${"-".repeat(40)}`);
	console.log(`Run ${runNumber}/${MAX_RUNS}`);
	console.log("-".repeat(40));
	console.log("Running: FALCON_DEBUG=1 FALCON_CLI_TEST_DEBUG=1 bun test ...\n");

	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";

		const child = spawn("bun", ["test"], {
			stdio: ["inherit", "pipe", "pipe"],
			env: {
				...process.env,
				FALCON_DEBUG: "1",
				FALCON_CLI_TEST_DEBUG: "1",
			},
		});

		child.stdout?.on("data", (data) => {
			const chunk = data.toString();
			stdout += chunk;
			process.stdout.write(chunk);
		});

		child.stderr?.on("data", (data) => {
			const chunk = data.toString();
			stderr += chunk;
			process.stderr.write(chunk);
		});

		child.on("close", async (exitCode) => {
			const logContent = stdout + stderr;
			const passed = exitCode === 0;

			// Save full log
			await writeFile(runLogPath, logContent);

			if (!passed) {
				// Extract failure details
				const failureLines = logContent
					.split("\n")
					.filter((line) =>
						/✗|fail|error|Error|FAIL|Timed out|expect|assert|---|\bat\b|\.test\.ts|\.test\.tsx/.test(
							line,
						),
					)
					.join("\n");

				const failContent = `
========================================
FAILURE DETAILS FOR RUN ${runNumber}
Exit code: ${exitCode}
Timestamp: ${new Date().toISOString()}
========================================

${failureLines}
`;
				await writeFile(failLogPath, failContent);
				console.log(`\n✗ Run ${runNumber} FAILED (exit code: ${exitCode})`);
				console.log(`Failure details saved to: ${failLogPath}`);
			} else {
				console.log(`\n✓ Run ${runNumber} PASSED`);
			}

			resolve({
				runNumber,
				passed,
				exitCode: exitCode ?? -1,
				logContent,
				failLogPath: passed ? undefined : failLogPath,
			});
		});
	});
}

async function main() {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
	const runDir = join(OUTPUT_DIR, timestamp);

	console.log("=".repeat(40));
	console.log("Flaky Test Detector");
	console.log("=".repeat(40));
	console.log(`Max runs: ${MAX_RUNS}`);
	console.log(`Output directory: ${runDir}`);
	console.log("Debug mode: ENABLED\n");

	await mkdir(runDir, { recursive: true });

	const results: RunResult[] = [];

	for (let i = 1; i <= MAX_RUNS; i++) {
		const result = await runTests(i, runDir);
		results.push(result);
	}

	// Generate summary
	const failedRuns = results.filter((r) => !r.passed);
	const failCount = failedRuns.length;
	const passCount = results.length - failCount;

	console.log("\n" + "=".repeat(40));
	console.log("SUMMARY REPORT");
	console.log("=".repeat(40));
	console.log(`Total runs: ${results.length}`);
	console.log(`Passed: ${passCount}`);
	console.log(`Failed: ${failCount}`);

	if (failCount > 0) {
		console.log(
			`\nFailed runs: ${failedRuns.map((r) => r.runNumber).join(", ")}`,
		);
		console.log("\nFailure logs:");
		for (const run of failedRuns) {
			if (run.failLogPath) {
				console.log(`  - ${run.failLogPath}`);
			}
		}
		console.log("\nFull logs:");
		for (let i = 1; i <= results.length; i++) {
			console.log(`  - ${join(runDir, `run_${i}.log`)}`);
		}

		// Extract potentially flaky test files - only those with actual failures
		const testFiles = new Set<string>();
		for (const run of failedRuns) {
			const lines = run.logContent.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				// Look for test file headers (e.g., "tests/cli/cli.test.ts:")
				const fileMatch = line.match(/^(tests\/[a-zA-Z0-9_/]+\.test\.tsx?):?$/);
				if (fileMatch) {
					// Check if this file has any failures in subsequent lines
					// Look ahead for "(fail)" entries before the next test file or summary
					for (let j = i + 1; j < lines.length; j++) {
						const nextLine = lines[j];
						// Stop if we hit another test file or summary line
						if (
							/^tests\/[a-zA-Z0-9_/]+\.test\.tsx?:?$/.test(nextLine) ||
							/^\d+ tests? failed/.test(nextLine)
						) {
							break;
						}
						// If we find a failure for this file, add it
						if (/^\(fail\)/.test(nextLine)) {
							testFiles.add(fileMatch[1]);
							break;
						}
					}
				}
			}
		}

		console.log("\n" + "=".repeat(40));
		console.log("FLAKY TESTS DETECTED");
		console.log("=".repeat(40));
		console.log("Some tests are failing intermittently.");
		console.log("Review the failure logs above to identify the flaky tests.");

		if (testFiles.size > 0) {
			console.log("\nPotentially flaky test files:");
			for (const file of testFiles) {
				console.log(`  - ${file}`);
			}
		}

		process.exit(1);
	} else {
		console.log("\n" + "=".repeat(40));
		console.log("ALL RUNS PASSED");
		console.log("=".repeat(40));
		console.log(`No flaky tests detected in ${results.length} runs.`);
		console.log(`\nLogs saved to: ${runDir}/`);
		process.exit(0);
	}
}

main().catch((err) => {
	console.error("Error running flaky test detector:", err);
	process.exit(1);
});
