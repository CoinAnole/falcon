import type { AspectRatio, CliResolution } from "./api/models";

export interface PresetFlags {
	cover?: boolean;
	square?: boolean;
	landscape?: boolean;
	portrait?: boolean;
	story?: boolean;
	reel?: boolean;
	feed?: boolean;
	og?: boolean;
	wallpaper?: boolean;
	wide?: boolean;
	ultra?: boolean;
}

export interface PresetResolution {
	aspect: AspectRatio;
	resolution: CliResolution;
}

export const PRESET_MAPPINGS = [
	{ flag: "cover", aspect: "2:3", resolution: "2K" },
	{ flag: "story", aspect: "9:16" },
	{ flag: "reel", aspect: "9:16" },
	{ flag: "feed", aspect: "4:5" },
	{ flag: "og", aspect: "16:9" },
	{ flag: "wallpaper", aspect: "9:16", resolution: "2K" },
	{ flag: "ultra", aspect: "21:9", resolution: "2K" },
	{ flag: "wide", aspect: "21:9" },
	{ flag: "square", aspect: "1:1" },
	{ flag: "landscape", aspect: "16:9" },
	{ flag: "portrait", aspect: "2:3" },
] as const;

/**
 * Applies preset flag overrides to aspect and resolution using CLI priority order.
 */
export function applyPresetOverrides(
	flags: PresetFlags,
	initial: PresetResolution
): PresetResolution {
	let { aspect, resolution } = initial;

	if (flags.cover) {
		aspect = "2:3";
		resolution = "2K";
	} else if (flags.story || flags.reel) {
		aspect = "9:16";
	} else if (flags.feed) {
		aspect = "4:5";
	} else if (flags.og) {
		aspect = "16:9";
	} else if (flags.wallpaper) {
		aspect = "9:16";
		resolution = "2K";
	} else if (flags.wide) {
		aspect = "21:9";
	} else if (flags.ultra) {
		aspect = "21:9";
		resolution = "2K";
	} else if (flags.square) {
		aspect = "1:1";
	} else if (flags.landscape) {
		aspect = "16:9";
	} else if (flags.portrait) {
		aspect = "2:3";
	}

	return { aspect, resolution };
}
