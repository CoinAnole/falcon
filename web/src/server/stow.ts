import { StowServer } from "@howells/stow-server";

function getStowClient() {
	const apiKey = process.env.STOW_API_KEY;
	if (!apiKey) {
		throw new Error("STOW_API_KEY environment variable is not set");
	}

	return new StowServer({
		apiKey,
		bucket: process.env.STOW_BUCKET || "falcon",
	});
}

// Lazy singleton
let _stow: StowServer | null = null;

export function stow(): StowServer {
	if (!_stow) {
		_stow = getStowClient();
	}
	return _stow;
}

/** Derive a public Stow CDN URL from a file key. */
export function stowUrl(key: string): string {
	const bucket = process.env.STOW_BUCKET || "falcon";
	return `https://${bucket}.stow.sh/${key}`;
}
