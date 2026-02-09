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
