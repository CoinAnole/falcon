import { mock } from "bun:test";
import type { FalconConfig, History } from "../../src/studio/deps/config";

export const STUDIO_TEST_CONFIG: FalconConfig = {
	defaultModel: "banana",
	defaultAspect: "1:1",
	defaultResolution: "2K",
	openAfterGenerate: false,
	upscaler: "clarity",
	backgroundRemover: "rmbg",
	promptExpansion: false,
};

export function createEmptyStudioHistory(): History {
	return {
		generations: [],
		totalCost: { USD: { session: 0, today: 0, allTime: 0 } },
		lastSessionDate: new Date().toISOString().split("T")[0],
	};
}

interface RegisterStudioMocksOptions {
	config?: FalconConfig;
	history?: History;
	includeImage?: boolean;
	includeConfig?: boolean;
	includePaths?: boolean;
	includeLogger?: boolean;
	imageOverrides?: Record<string, unknown>;
	configOverrides?: Record<string, unknown>;
	pathOverrides?: Record<string, unknown>;
	loggerOverrides?: Record<string, unknown>;
}

export function registerStudioMocks(
	options: RegisterStudioMocksOptions = {}
): void {
	const {
		config = STUDIO_TEST_CONFIG,
		history = createEmptyStudioHistory(),
		includeImage = true,
		includeConfig = true,
		includePaths = true,
		includeLogger = true,
		imageOverrides = {},
		configOverrides = {},
		pathOverrides = {},
		loggerOverrides = {},
	} = options;

	if (includeImage) {
		mock.module("../../src/studio/deps/image", () => ({
			downloadImage: mock(() => Promise.resolve()),
			openImage: mock(() => undefined),
			generateFilename: mock(() => "test-output.png"),
			getImageDimensions: mock(() =>
				Promise.resolve({ width: 1024, height: 1024 })
			),
			getFileSize: mock(() => "1.2 MB"),
			imageToDataUrl: mock(() =>
				Promise.resolve("data:image/png;base64,dGVzdA==")
			),
			...imageOverrides,
		}));
	}

	if (includeConfig) {
		mock.module("../../src/studio/deps/config", () => ({
			addGeneration: mock(() => Promise.resolve()),
			generateId: mock(() => "test-id"),
			loadConfig: mock(() => Promise.resolve(config)),
			loadHistory: mock(() => Promise.resolve(history)),
			FALCON_DIR: "/tmp/falcon-test",
			...configOverrides,
		}));
	}

	if (includePaths) {
		mock.module("../../src/studio/deps/paths", () => ({
			validateOutputPath: mock((p: string) => p),
			validateImagePath: mock(() => undefined),
			isPathWithinCwd: mock(() => true),
			...pathOverrides,
		}));
	}

	if (includeLogger) {
		mock.module("../../src/studio/deps/logger", () => ({
			logger: {
				debug: () => undefined,
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
				errorWithStack: () => undefined,
			},
			...loggerOverrides,
		}));
	}
}
