"use client";

import Image from "next/image";
import { useState } from "react";
import type { GeneratedImage } from "@/components/image-grid";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

const SKELETON_KEYS = [
	"sk-a",
	"sk-b",
	"sk-c",
	"sk-d",
	"sk-e",
	"sk-f",
	"sk-g",
	"sk-h",
	"sk-i",
	"sk-j",
	"sk-k",
	"sk-l",
];

export default function GalleryPage() {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

	const summaryQuery = trpc.gallery.summary.useQuery();

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		trpc.gallery.list.useInfiniteQuery(
			{ limit: 24 },
			{
				getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			}
		);

	const allImages: GeneratedImage[] =
		data?.pages.flatMap((page) =>
			page.images.map((img) => ({
				key: img.key,
				url: img.url,
				metadata: img.metadata,
			}))
		) || [];

	const renderContent = () => {
		if (isLoading) {
			return (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{SKELETON_KEYS.map((key) => (
						<div className="skeleton aspect-square rounded-lg" key={key} />
					))}
				</div>
			);
		}

		if (allImages.length === 0) {
			return (
				<div className="flex flex-col items-center gap-3 py-24 text-center">
					<p className="text-sm text-text-tertiary">No images yet</p>
					<a
						className="rounded-md bg-accent px-4 py-2 font-medium text-[13px] text-white transition-colors hover:bg-accent-hover"
						href="/"
					>
						Generate your first image
					</a>
				</div>
			);
		}

		return (
			<>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{allImages.map((image, index) => (
						<button
							className="group relative overflow-hidden rounded-lg bg-surface"
							key={image.key}
							onClick={() => setLightboxIndex(index)}
							type="button"
						>
							{image.url ? (
								<Image
									alt={image.metadata?.prompt || "Generated image"}
									className="aspect-square w-full object-cover"
									height={300}
									sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
									src={`${image.url}?w=300&f=webp`}
									width={300}
								/>
							) : (
								<div className="aspect-square w-full bg-surface-2" />
							)}

							{/* Hover overlay */}
							<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
								<p className="line-clamp-2 text-[11px] text-white leading-tight">
									{image.metadata?.prompt || ""}
								</p>
								<div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-white/50">
									{image.metadata?.model && <span>{image.metadata.model}</span>}
									{image.metadata?.cost && <span>${image.metadata.cost}</span>}
								</div>
							</div>
						</button>
					))}
				</div>

				{hasNextPage && (
					<div className="flex justify-center py-6">
						<button
							className="rounded-md bg-surface-2 px-6 py-2 text-[12px] text-text-secondary transition-colors hover:text-text disabled:opacity-50"
							disabled={isFetchingNextPage}
							onClick={() => fetchNextPage()}
							type="button"
						>
							{isFetchingNextPage ? "Loading..." : "Load more"}
						</button>
					</div>
				)}
			</>
		);
	};

	return (
		<div className="flex h-screen flex-col">
			{/* Nav */}
			<nav className="flex shrink-0 items-center justify-between border-border-subtle border-b px-4 py-2.5">
				<a
					className="font-medium text-[15px] text-text tracking-tight"
					href="/"
				>
					<span className="mr-1.5 text-accent">&#9670;</span>
					falcon
				</a>
				<div className="flex items-center gap-4">
					<a className="text-text-secondary text-xs" href="/gallery">
						Gallery
					</a>
				</div>
			</nav>

			{/* Content */}
			<main className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-6xl px-6 py-6">
					<div className="mb-6 flex items-center justify-between">
						<h1 className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
							Gallery
						</h1>
						{summaryQuery.data && summaryQuery.data.totalImages > 0 && (
							<p className="font-mono text-[10px] text-text-tertiary">
								{summaryQuery.data.totalImages} images
								{summaryQuery.data.totalCost > 0 && (
									<> &middot; ${summaryQuery.data.totalCost.toFixed(2)} total</>
								)}
							</p>
						)}
					</div>

					{renderContent()}
				</div>
			</main>

			{/* Lightbox */}
			{lightboxIndex !== null && allImages[lightboxIndex] && (
				<ImageLightbox
					currentIndex={lightboxIndex}
					image={allImages[lightboxIndex]}
					images={allImages}
					onClose={() => setLightboxIndex(null)}
					onNavigate={setLightboxIndex}
				/>
			)}
		</div>
	);
}
