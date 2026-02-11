import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { ASPECT_RATIOS, RESOLUTIONS } from "../../src/api/models";
import {
	applyPresetOverrides,
	PRESET_MAPPINGS,
	type PresetFlags,
} from "../../src/cli-presets";

type PresetFlag = (typeof PRESET_MAPPINGS)[number]["flag"];

function withOnlyFlag(flag: PresetFlag): PresetFlags {
	return {
		cover: flag === "cover",
		story: flag === "story",
		reel: flag === "reel",
		feed: flag === "feed",
		og: flag === "og",
		wallpaper: flag === "wallpaper",
		ultra: flag === "ultra",
		wide: flag === "wide",
		square: flag === "square",
		landscape: flag === "landscape",
		portrait: flag === "portrait",
	};
}

describe("cli preset mapping", () => {
	it("does not change values when no preset flags are enabled", () => {
		const result = applyPresetOverrides(
			{},
			{ aspect: "3:2", resolution: "4K" },
		);
		expect(result.aspect).toBe("3:2");
		expect(result.resolution).toBe("4K");
	});

	it("applies each preset mapping deterministically", () => {
		for (const mapping of PRESET_MAPPINGS) {
			const result = applyPresetOverrides(withOnlyFlag(mapping.flag), {
				aspect: "1:1",
				resolution: "1K",
			});
			expect(result.aspect).toBe(mapping.aspect);
			expect(result.resolution).toBe(mapping.resolution ?? "1K");
		}
	});

	it("applies preset priority order when multiple flags are set", () => {
		const result = applyPresetOverrides(
			{
				cover: true,
				story: true,
				feed: true,
				og: true,
				wallpaper: true,
				wide: true,
				ultra: true,
				square: true,
				landscape: true,
				portrait: true,
			},
			{ aspect: "16:9", resolution: "1K" },
		);
		expect(result.aspect).toBe("2:3");
		expect(result.resolution).toBe("2K");
	});

	it("keeps wide precedence ahead of ultra for resolution override", () => {
		const result = applyPresetOverrides(
			{ wide: true, ultra: true },
			{ aspect: "16:9", resolution: "1K" },
		);
		expect(result.aspect).toBe("21:9");
		expect(result.resolution).toBe("1K");
	});

	it("property: preset mappings preserve expected aspect and resolution", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...PRESET_MAPPINGS),
				fc.constantFrom(...ASPECT_RATIOS),
				fc.constantFrom(...RESOLUTIONS),
				(mapping, baseAspect, baseResolution) => {
					const result = applyPresetOverrides(withOnlyFlag(mapping.flag), {
						aspect: baseAspect,
						resolution: baseResolution,
					});
					expect(result.aspect).toBe(mapping.aspect);
					expect(result.resolution).toBe(mapping.resolution ?? baseResolution);
				},
			),
			{ numRuns: PRESET_MAPPINGS.length * 2 },
		);
	});
});
