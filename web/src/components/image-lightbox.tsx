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
			<div className="relative z-10 flex max-h-[90vh] max-w-[90vw] gap-4">
				{/* Image */}
				<div className="relative flex items-center">
					{hasPrev && (
						<button
							className="absolute -left-10 rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
							onClick={() => onNavigate(currentIndex - 1)}
							type="button"
						>
							<svg
								fill="none"
								height="16"
								role="img"
								viewBox="0 0 20 20"
								width="16"
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
							className="absolute -right-10 rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
							onClick={() => onNavigate(currentIndex + 1)}
							type="button"
						>
							<svg
								fill="none"
								height="16"
								role="img"
								viewBox="0 0 20 20"
								width="16"
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
				<div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto rounded-lg bg-surface p-4">
					{/* Close button */}
					<button
						className="absolute top-2 right-2 rounded-md p-1 text-text-tertiary transition-colors hover:text-text-secondary"
						onClick={onClose}
						type="button"
					>
						<svg
							fill="none"
							height="16"
							role="img"
							viewBox="0 0 20 20"
							width="16"
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
							<p className="font-medium text-[11px] text-text-tertiary">
								Prompt
							</p>
							<p className="mt-1 text-[13px] text-text-secondary leading-relaxed">
								{meta.prompt}
							</p>
							<button
								className="mt-1 text-[11px] text-accent hover:text-accent-hover"
								onClick={() => navigator.clipboard.writeText(meta.prompt)}
								type="button"
							>
								Copy prompt
							</button>
						</div>
					)}

					{/* Details */}
					<div className="grid grid-cols-2 gap-2">
						{meta.model && (
							<div>
								<p className="text-[10px] text-text-tertiary">Model</p>
								<p className="text-[12px] text-text-secondary">{meta.model}</p>
							</div>
						)}
						{meta.aspect && (
							<div>
								<p className="text-[10px] text-text-tertiary">Aspect</p>
								<p className="text-[12px] text-text-secondary">{meta.aspect}</p>
							</div>
						)}
						{meta.resolution && (
							<div>
								<p className="text-[10px] text-text-tertiary">Resolution</p>
								<p className="text-[12px] text-text-secondary">
									{meta.resolution}
								</p>
							</div>
						)}
						{meta.cost && (
							<div>
								<p className="text-[10px] text-text-tertiary">Cost</p>
								<p className="font-mono text-[12px] text-text-secondary">
									${meta.cost}
								</p>
							</div>
						)}
						{meta.timestamp && (
							<div className="col-span-2">
								<p className="text-[10px] text-text-tertiary">Created</p>
								<p className="text-[12px] text-text-secondary">
									{new Date(meta.timestamp).toLocaleString()}
								</p>
							</div>
						)}
					</div>

					{/* Actions */}
					<div className="mt-auto flex flex-col gap-1.5">
						<a
							className="rounded-md bg-surface-2 px-3 py-1.5 text-center text-[12px] text-text-secondary transition-colors hover:text-text"
							download
							href={image.url}
							rel="noopener noreferrer"
							target="_blank"
						>
							Download
						</a>
						{onUpscale && (
							<button
								className="rounded-md bg-surface-2 px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:text-text"
								onClick={() => onUpscale(image)}
								type="button"
							>
								Upscale 2x
							</button>
						)}
						{onRemoveBg && (
							<button
								className="rounded-md bg-surface-2 px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:text-text"
								onClick={() => onRemoveBg(image)}
								type="button"
							>
								Remove Background
							</button>
						)}
						{onVary && (
							<button
								className="rounded-md bg-surface-2 px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:text-text"
								onClick={() => onVary(image)}
								type="button"
							>
								Variations
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
