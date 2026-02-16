import { describe, expect, it } from "bun:test";
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
		const validSet = new Set([2, 4, 6, 8]);
		for (let value = -1000; value <= 1000; value++) {
			if (validSet.has(value)) {
				continue;
			}
			expect(isValidUpscaleFactor(value)).toBe(false);
		}
	});
});
