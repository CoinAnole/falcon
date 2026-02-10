import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import {
	isValidUpscaleFactor,
	UPSCALE_FACTORS,
} from "../../src/utils/constants";

// --- 3.1 UPSCALE_FACTORS and isValidUpscaleFactor ---

describe("UPSCALE_FACTORS", () => {
	it("contains exactly [2, 4, 6, 8]", () => {
		expect([...UPSCALE_FACTORS]).toEqual([2, 4, 6, 8]);
	});
});

describe("isValidUpscaleFactor", () => {
	it("returns true for each valid factor", () => {
		for (const factor of [2, 4, 6, 8]) {
			expect(isValidUpscaleFactor(factor)).toBe(true);
		}
	});

	it("returns false for invalid values", () => {
		for (const value of [0, 1, 3, 5, 7, 10, -1, 2.5]) {
			expect(isValidUpscaleFactor(value)).toBe(false);
		}
	});
});

// --- 3.2 Property 5: isValidUpscaleFactor rejects non-members ---

describe("property tests", () => {
	// Feature: phase1-pure-utility-tests, Property 5: isValidUpscaleFactor rejects non-members
	/**
	 * Validates: Requirements 3.2
	 */
	it("Property 5: isValidUpscaleFactor rejects non-members", () => {
		console.log("[constants.test] Property 5 start");
		const validSet = new Set([2, 4, 6, 8]);
		fc.assert(
			fc.property(
				fc.integer({ min: -1000, max: 1000 }).filter((n) => !validSet.has(n)),
				(value) => {
					expect(isValidUpscaleFactor(value)).toBe(false);
				},
			),
			{ numRuns: 50 },
		);
		console.log("[constants.test] Property 5 end");
	});
});
