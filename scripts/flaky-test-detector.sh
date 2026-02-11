#!/bin/bash
#
# Flaky Test Detector
# Runs the full test suite up to 10 times with debugging enabled,
# capturing output of failing tests to files for analysis.
#

# Configuration
MAX_RUNS="${FALCON_FLAKY_MAX_RUNS:-10}"
OUTPUT_DIR="test-runs"
RUN_TIMEOUT_SECONDS=180
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_DIR="${OUTPUT_DIR}/${TIMESTAMP}"

# Create output directory
mkdir -p "${RUN_DIR}"

echo "========================================"
echo "Flaky Test Detector"
echo "========================================"
echo "Max runs: ${MAX_RUNS}"
echo "Output directory: ${RUN_DIR}"
echo "Debug mode: ENABLED"
echo "Per-run watchdog timeout: ${RUN_TIMEOUT_SECONDS}s"
echo ""

# Track results
declare -a FAILED_RUNS
declare -a FAILURE_LOGS
RUN_COUNT=0
FAIL_COUNT=0

# Run tests up to MAX_RUNS times
for ((i=1; i<=MAX_RUNS; i++)); do
    RUN_COUNT=$i
    echo "----------------------------------------"
    echo "Run ${i}/${MAX_RUNS}"
    echo "----------------------------------------"

    RUN_LOG="${RUN_DIR}/run_${i}.log"
    FAIL_LOG="${RUN_DIR}/run_${i}_failures.log"

    # Run tests with debug mode enabled, capture all output
    echo "Running: FALCON_DEBUG=1 FALCON_CLI_TEST_DEBUG=1 bun test ..."
    echo "Watchdog: ${RUN_TIMEOUT_SECONDS}s"

    # Run test and capture output, preserving exit code
    # Use a subshell to prevent set -e from exiting on test failure
    EXIT_CODE=0
    TIMED_OUT=0
    (
        set -o pipefail
        timeout "${RUN_TIMEOUT_SECONDS}s" env FALCON_DEBUG=1 FALCON_CLI_TEST_DEBUG=1 bun test 2>&1 | tee "${RUN_LOG}"
    ) || EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
        TIMED_OUT=1
        echo "[flaky-detector] run timed out after ${RUN_TIMEOUT_SECONDS}s" >> "${RUN_LOG}"
    fi

    if [ $EXIT_CODE -eq 0 ]; then
        echo "✓ Run ${i} PASSED"
    else
        if [ $TIMED_OUT -eq 1 ]; then
            echo "✗ Run ${i} FAILED (exit code: ${EXIT_CODE}, watchdog timeout)"
        else
            echo "✗ Run ${i} FAILED (exit code: ${EXIT_CODE})"
        fi
        FAILED_RUNS+=($i)

        # Extract failure details from the log
        echo "========================================" > "${FAIL_LOG}"
        echo "FAILURE DETAILS FOR RUN ${i}" >> "${FAIL_LOG}"
        echo "Exit code: ${EXIT_CODE}" >> "${FAIL_LOG}"
        if [ $TIMED_OUT -eq 1 ]; then
            echo "Timed out: yes" >> "${FAIL_LOG}"
        else
            echo "Timed out: no" >> "${FAIL_LOG}"
        fi
        echo "Timestamp: $(date -Iseconds)" >> "${FAIL_LOG}"
        echo "========================================" >> "${FAIL_LOG}"
        echo "" >> "${FAIL_LOG}"

        # Extract test failure sections (lines with fail, error, or stack traces)
        grep -E "(✗|fail|error|Error|FAIL|Timed out|expect|assert|---|\\bat\\b|\\.test\\.ts|\\.test\\.tsx)" "${RUN_LOG}" >> "${FAIL_LOG}" 2>/dev/null || true
        if [ $TIMED_OUT -eq 1 ]; then
            echo "" >> "${FAIL_LOG}"
            echo "Last 80 log lines before timeout:" >> "${FAIL_LOG}"
            tail -n 80 "${RUN_LOG}" >> "${FAIL_LOG}" 2>/dev/null || true
        fi

        FAILURE_LOGS+=("${FAIL_LOG}")
        ((FAIL_COUNT++))

        echo "Failure details saved to: ${FAIL_LOG}"
    fi

    echo ""
done

# Generate summary report
echo ""
echo "========================================"
echo "SUMMARY REPORT"
echo "========================================"
echo "Total runs: ${RUN_COUNT}"
echo "Passed: $((RUN_COUNT - FAIL_COUNT))"
echo "Failed: ${FAIL_COUNT}"
echo ""

if [ ${FAIL_COUNT} -gt 0 ]; then
    echo "Failed runs: ${FAILED_RUNS[*]}"
    echo ""
    echo "Failure logs:"
    for log in "${FAILURE_LOGS[@]}"; do
        echo "  - ${log}"
    done
    echo ""
    echo "Full logs:"
    for ((i=1; i<=RUN_COUNT; i++)); do
        echo "  - ${RUN_DIR}/run_${i}.log"
    done
    echo ""
    echo "========================================"
    echo "FLAKY TESTS DETECTED"
    echo "========================================"
    echo "Some tests are failing intermittently."
    echo "Review the failure logs above to identify the flaky tests."

    # Try to identify which tests actually failed (not just appeared in output)
    # Only report test files that have "(fail)" entries associated with them
    echo ""
    echo "Potentially flaky test files:"
    for log in "${FAILURE_LOGS[@]}"; do
        # Extract test files that have failures by looking at context
        # A test file is flaky if it appears before "(fail)" entries
        awk '
            /^tests\/[a-zA-Z0-9_\/]+\.test\.tsx?:?$/ {
                current_file = $0
                gsub(/:$/, "", current_file)
                has_failure = 0
            }
            /^\(fail\)/ && current_file != "" {
                has_failure = 1
                failed_files[current_file] = 1
            }
            END {
                for (file in failed_files) {
                    print file
                }
            }
        ' "${log}" 2>/dev/null || true
    done | sort -u

    exit 1
else
    echo "========================================"
    echo "ALL RUNS PASSED"
    echo "========================================"
    echo "No flaky tests detected in ${RUN_COUNT} runs."
    echo ""
    echo "Logs saved to: ${RUN_DIR}/"
    exit 0
fi
