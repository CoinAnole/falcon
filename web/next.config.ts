import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	outputFileTracingRoot: path.join(import.meta.dirname, ".."),
	images: {
		remotePatterns: [{ hostname: "*.stow.sh" }, { hostname: "*.fal.media" }],
	},
};

export default nextConfig;
