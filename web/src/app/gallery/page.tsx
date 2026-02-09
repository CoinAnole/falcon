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

	if (isLoading) {
		return (
			<div className="space-y-6">
				<h1 className="font-semibold text-2xl">Gallery</h1>
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
					{SKELETON_KEYS.map((key) => (
						<div className="skeleton aspect-square rounded-lg" key={key} />
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<h1 className="font-semibold text-2xl">Gallery</h1>

			{allImages.length === 0 ? (
				<div className="flex flex-col items-center gap-3 py-20 text-center">
					<p className="text-text-muted">No images yet</p>
					<a
						className="rounded-md bg-accent px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-accent-hover"
						href="/"
					>
						Generate your first image
					</a>
				</div>
			) : (
				<>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{allImages.map((image, index) => (
							<button
								className="group relative overflow-hidden rounded-lg border border-border bg-surface"
								key={image.key}
								onClick={() => setLightboxIndex(index)}
								type="button"
							>
								{image.url ? (
									<Image
										alt={image.metadata?.prompt || "Generated image"}
										className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
										height={300}
										sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
										src={`${image.url}?w=300&f=webp`}
										width={300}
									/>
								) : (
									<div className="aspect-square w-full bg-surface-2" />
								)}

								{/* Prompt overlay */}
								<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
									<p className="line-clamp-2 text-white text-xs">
										{image.metadata?.prompt || ""}
									</p>
									<div className="mt-1 flex items-center gap-2 text-[10px] text-white/60">
										{image.metadata?.model && (
											<span>{image.metadata.model}</span>
										)}
										{image.metadata?.cost && (
											<span>${image.metadata.cost}</span>
										)}
									</div>
								</div>
							</button>
						))}
					</div>

					{hasNextPage && (
						<div className="flex justify-center">
							<button
								className="rounded-md border border-border bg-surface px-6 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-50"
								disabled={isFetchingNextPage}
								onClick={() => fetchNextPage()}
								type="button"
							>
								{isFetchingNextPage ? "Loading..." : "Load more"}
							</button>
						</div>
					)}
				</>
			)}

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
