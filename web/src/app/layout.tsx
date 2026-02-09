import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
	title: "Falcon",
	description: "AI Image Generation",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html className="dark" lang="en">
			<body className="min-h-screen bg-bg antialiased">
				<Providers>
					<nav className="border-border border-b">
						<div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
							<a className="font-semibold text-lg tracking-tight" href="/">
								Falcon
							</a>
							<a
								className="text-sm text-text-muted transition-colors hover:text-text"
								href="/gallery"
							>
								Gallery
							</a>
						</div>
					</nav>
					<main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
				</Providers>
			</body>
		</html>
	);
}
