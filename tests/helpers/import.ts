export interface ImportRetryOptions {
	label: string;
	timeoutMs?: number;
	maxAttempts?: number;
	retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 100;

class ImportTimeoutError extends Error {
	constructor(
		label: string,
		timeoutMs: number,
		attempt: number,
		maxAttempts: number
	) {
		super(
			`[importWithTimeoutRetry] ${label} timed out after ${timeoutMs}ms (attempt ${attempt}/${maxAttempts})`
		);
		this.name = "ImportTimeoutError";
	}
}

async function waitForImportWithTimeout<T>(
	importer: () => Promise<T>,
	label: string,
	timeoutMs: number,
	attempt: number,
	maxAttempts: number
): Promise<T> {
	const importPromise = importer();
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			importPromise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(
						new ImportTimeoutError(label, timeoutMs, attempt, maxAttempts)
					);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
	}
}

async function waitForRetryDelay(retryDelayMs: number): Promise<void> {
	if (retryDelayMs <= 0) {
		return;
	}
	await new Promise<void>((resolve) => {
		setTimeout(resolve, retryDelayMs);
	});
}

export async function importWithTimeoutRetry<T>(
	importer: () => Promise<T>,
	options: ImportRetryOptions
): Promise<T> {
	const {
		label,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxAttempts = DEFAULT_MAX_ATTEMPTS,
		retryDelayMs = DEFAULT_RETRY_DELAY_MS,
	} = options;

	let lastTimeoutError: ImportTimeoutError | undefined;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await waitForImportWithTimeout(
				importer,
				label,
				timeoutMs,
				attempt,
				maxAttempts
			);
		} catch (err) {
			if (!(err instanceof ImportTimeoutError)) {
				throw err;
			}
			lastTimeoutError = err;
			if (attempt < maxAttempts) {
				await waitForRetryDelay(retryDelayMs);
			}
		}
	}

	throw (
		lastTimeoutError ??
		new Error(
			`[importWithTimeoutRetry] ${label} failed after ${maxAttempts} attempts`
		)
	);
}
