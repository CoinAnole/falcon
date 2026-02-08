export const UPSCALE_FACTORS = [2, 4, 6, 8] as const;

export type UpscaleFactor = (typeof UPSCALE_FACTORS)[number];

export function isValidUpscaleFactor(value: number): value is UpscaleFactor {
	return UPSCALE_FACTORS.includes(value as UpscaleFactor);
}
