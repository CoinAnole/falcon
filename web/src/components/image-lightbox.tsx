"use client";

import Image from "next/image";
import { useCallback, useEffect } from "react";
import type { GeneratedImage } from "./image-grid";

interface ImageLightboxProps {
	image: GeneratedImage;
	images: GeneratedImage[];
	currentIndex: number;
	onClose: () => void;
	onNavigate: (index: number) => void;
	onUpscale?: (image: GeneratedImage) => void;
	onRemoveBg?: (image: GeneratedImage) => void;
	onVary?: (image: GeneratedImage) => void;
}

export function ImageLightbox({
	image,
	images,
	currentIndex,
	onClose,
	onNavigate,
	onUpscale,
	onRemoveBg,
	onVary,
}: ImageLightboxProps) {
	const hasPrev = currentIndex > 0;
	const hasNext = currentIndex < images.length - 1;

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			switch (e.key) {
				case "Escape":
					onClose();
					break;
				case "ArrowLeft":
					if (hasPrev) {
						onNavigate(currentIndex - 1);
					}
					break;
				case "ArrowRight":
					if (hasNext) {
						onNavigate(currentIndex + 1);
					}
					break;
				default:
					break;
			}
		},
		[onClose, onNavigate, currentIndex, hasPrev, hasNext]
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "";
		};
	}, [handleKeyDown]);

	if (!image.url) {
		return null;
	}

	const meta = image.metadata || {};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<button
				aria-label="Close lightbox"
				className="absolute inset-0 bg-black/90 backdrop-blur-sm"
				onClick={onClose}
				type="button"
			/>

			{/* Content */}
			<div className="relative z-10 flex max-h-[90vh] max-w-[90vw] gap-6">
				{/* Image */}
				<div className="relative flex items-center">
					{hasPrev && (
						<button
							className="absolute -left-12 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
							onClick={() => onNavigate(currentIndex - 1)}
							type="button"
						>
							<svg
								fill="none"
								height="20"
								role="img"
								viewBox="0 0 20 20"
								width="20"
							>
								<title>Previous image</title>
								<path
									d="M12 4L6 10L12 16"
									stroke="currentColor"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
								/>
							</svg>
						</button>
					)}

					<div className="relative max-h-[85vh] max-w-[60vw]">
						<Image
							alt={meta.prompt || "Generated image"}
							className="max-h-[85vh] max-w-[60vw] rounded-lg object-contain"
							height={1024}
							sizes="60vw"
							src={image.url}
							width={1024}
						/>
					</div>

					{hasNext && (
						<button
							className="absolute -right-12 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
							onClick={() => onNavigate(currentIndex + 1)}
							type="button"
						>
							<svg
								fill="none"
								height="20"
								role="img"
								viewBox="0 0 20 20"
								width="20"
							>
								<title>Next image</title>
								<path
									d="M8 4L14 10L8 16"
									stroke="currentColor"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
								/>
							</svg>
						</button>
					)}
				</div>

				{/* Metadata panel */}
				<div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface p-5">
					{/* Close button */}
					<button
						className="absolute top-2 right-2 rounded-md p-1 text-text-muted transition-colors hover:text-text"
						onClick={onClose}
						type="button"
					>
						<svg
							fill="none"
							height="20"
							role="img"
							viewBox="0 0 20 20"
							width="20"
						>
							<title>Close</title>
							<path
								d="M5 5L15 15M5 15L15 5"
								stroke="currentColor"
								strokeLinecap="round"
								strokeWidth="2"
							/>
						</svg>
					</button>

					{/* Prompt */}
					{meta.prompt && (
						<div>
							<span className="font-medium text-text-muted text-xs uppercase tracking-wider">
								Prompt
							</span>
							<p className="mt-1 text-sm leading-relaxed">{meta.prompt}</p>
							<button
								className="mt-1 text-accent text-xs hover:text-accent-hover"
								onClick={() => navigator.clipboard.writeText(meta.prompt)}
								type="button"
							>
								Copy prompt
							</button>
						</div>
					)}

					{/* Details */}
					<div className="grid grid-cols-2 gap-3 text-sm">
						{meta.model && (
							<div>
								<span className="text-text-muted text-xs">Model</span>
								<p>{meta.model}</p>
							</div>
						)}
						{meta.aspect && (
							<div>
								<span className="text-text-muted text-xs">Aspect</span>
								<p>{meta.aspect}</p>
							</div>
						)}
						{meta.resolution && (
							<div>
								<span className="text-text-muted text-xs">Resolution</span>
								<p>{meta.resolution}</p>
							</div>
						)}
						{meta.cost && (
							<div>
								<span className="text-text-muted text-xs">Cost</span>
								<p>${meta.cost}</p>
							</div>
						)}
						{meta.timestamp && (
							<div className="col-span-2">
								<span className="text-text-muted text-xs">Created</span>
								<p>{new Date(meta.timestamp).toLocaleString()}</p>
							</div>
						)}
					</div>

					{/* Actions */}
					<div className="mt-auto flex flex-col gap-2">
						<a
							className="rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-sm text-text transition-colors hover:bg-border"
							download
							href={image.url}
							rel="noopener noreferrer"
							target="_blank"
						>
							Download Original
						</a>
						{onUpscale && (
							<button
								className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text transition-colors hover:bg-border"
								onClick={() => onUpscale(image)}
								type="button"
							>
								Upscale 2x
							</button>
						)}
						{onRemoveBg && (
							<button
								className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text transition-colors hover:bg-border"
								onClick={() => onRemoveBg(image)}
								type="button"
							>
								Remove Background
							</button>
						)}
						{onVary && (
							<button
								className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text transition-colors hover:bg-border"
								onClick={() => onVary(image)}
								type="button"
							>
								Generate Variations
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
