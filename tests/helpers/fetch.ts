export interface MockFetchCall {
	input: RequestInfo | URL;
	init?: RequestInit;
}

export async function withMockFetch<T>(
	impl: (
		input: RequestInfo | URL,
		init?: RequestInit
	) => Promise<Response> | Response,
	run: () => Promise<T> | T
): Promise<{ result: T; calls: MockFetchCall[] }> {
	const calls: MockFetchCall[] = [];
	const original = globalThis.fetch;

	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ input, init });
		return impl(input, init);
	}) as typeof fetch;

	try {
		const result = await run();
		return { result, calls };
	} finally {
		globalThis.fetch = original;
	}
}
