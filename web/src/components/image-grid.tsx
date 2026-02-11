"use client";

import Image from "next/image";

export interface GeneratedImage {
	key: string;
	url: string | null;
	width?: number | null;
	height?: number | null;
	metadata?: Record<string, string>;
}

interface ImageGridProps {
	images: GeneratedImage[];
	isLoading?: boolean;
	loadingCount?: number;
	loadingAspect?: string;
	onImageClick?: (image: GeneratedImage, index: number) => void;
	onUpscale?: (image: GeneratedImage) => void;
	onRemoveBg?: (image: GeneratedImage) => void;
	onVary?: (image: GeneratedImage) => void;
}

const SKELETON_KEYS = ["sk-a", "sk-b", "sk-c", "sk-d"];

function getAspectClass(aspect?: string): string {
	switch (aspect) {
		case "16:9":
		case "3:2":
			return "aspect-video";
		case "9:16":
		case "2:3":
			return "aspect-[9/16]";
		case "4:3":
			return "aspect-[4/3]";
		case "3:4":
			return "aspect-[3/4]";
		case "4:5":
			return "aspect-[4/5]";
		case "5:4":
			return "aspect-[5/4]";
		case "21:9":
			return "aspect-[21/9]";
		default:
			return "aspect-square";
	}
}

function ImageCard({
	image,
	index,
	onImageClick,
	onUpscale,
	onRemoveBg,
	onVary,
}: {
	image: GeneratedImage;
	index: number;
	onImageClick?: (image: GeneratedImage, index: number) => void;
	onUpscale?: (image: GeneratedImage) => void;
	onRemoveBg?: (image: GeneratedImage) => void;
	onVary?: (image: GeneratedImage) => void;
}) {
	if (!image.url) {
		return null;
	}

	return (
		<div className="group relative overflow-hidden rounded-lg bg-surface">
			<button
				className="block w-full"
				onClick={() => onImageClick?.(image, index)}
				type="button"
			>
				<Image
					alt={image.metadata?.prompt || "Generated image"}
					className="w-full object-cover"
					height={1024}
					sizes="(max-width: 640px) 100vw, 50vw"
					src={image.url}
					width={1024}
				/>
			</button>

			{/* Hover actions */}
			<div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
				<a
					className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white backdrop-blur-sm transition-colors hover:bg-white/20"
					download
					href={image.url}
					onClick={(e) => e.stopPropagation()}
					rel="noopener noreferrer"
					target="_blank"
				>
					Download
				</a>
				{onUpscale && (
					<button
						className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white backdrop-blur-sm transition-colors hover:bg-white/20"
						onClick={(e) => {
							e.stopPropagation();
							onUpscale(image);
						}}
						type="button"
					>
						Upscale
					</button>
				)}
				{onRemoveBg && (
					<button
						className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white backdrop-blur-sm transition-colors hover:bg-white/20"
						onClick={(e) => {
							e.stopPropagation();
							onRemoveBg(image);
						}}
						type="button"
					>
						Remove BG
					</button>
				)}
				{onVary && (
					<button
						className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white backdrop-blur-sm transition-colors hover:bg-white/20"
						onClick={(e) => {
							e.stopPropagation();
							onVary(image);
						}}
						type="button"
					>
						Vary
					</button>
				)}
			</div>
		</div>
	);
}

export function ImageGrid({
	images,
	isLoading,
	loadingCount = 1,
	loadingAspect,
	onImageClick,
	onUpscale,
	onRemoveBg,
	onVary,
}: ImageGridProps) {
	if (isLoading && images.length === 0) {
		return (
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{SKELETON_KEYS.slice(0, loadingCount).map((key) => (
					<div
						className={`skeleton rounded-lg ${getAspectClass(loadingAspect)}`}
						key={key}
					/>
				))}
			</div>
		);
	}

	if (images.length === 0) {
		return null;
	}

	const cols =
		images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

	return (
		<div className={`grid gap-3 ${cols}`}>
			{images.map((image, i) => (
				<ImageCard
					image={image}
					index={i}
					key={image.key}
					onImageClick={onImageClick}
					onRemoveBg={onRemoveBg}
					onUpscale={onUpscale}
					onVary={onVary}
				/>
			))}
		</div>
	);
}
