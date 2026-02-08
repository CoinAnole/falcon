export interface MockFetchCall {
	input: RequestInfo | URL;
	init?: RequestInit;
}

export function withMockFetch(
	impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): { restore: () => void; calls: MockFetchCall[] } {
	const calls: MockFetchCall[] = [];
	const original = globalThis.fetch;

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ input, init });
		return impl(input, init);
	}) as typeof fetch;

	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}
