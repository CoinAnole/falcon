"use client";

import { useCallback, useState } from "react";
import {
	GenerateForm,
	type GenerateSettings,
} from "@/components/generate-form";
import { type GeneratedImage, ImageGrid } from "@/components/image-grid";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

export default function GeneratePage() {
	const [images, setImages] = useState<GeneratedImage[]>([]);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [persistError, setPersistError] = useState<string | null>(null);
	const [lastSettings, setLastSettings] = useState<GenerateSettings | null>(
		null
	);

	const persistGeneration = trpc.generate.persist.useMutation();
	const persistProcess = trpc.process.persist.useMutation();

	/** Swap a fal URL for a Stow URL in the images array by matching on falUrl */
	const swapUrl = useCallback(
		(falUrl: string, stowKey: string, stowUrl: string | null) => {
			setImages((prev) =>
				prev.map((img) =>
					img.url === falUrl
						? { ...img, key: stowKey, url: stowUrl || img.url }
						: img
				)
			);
		},
		[]
	);

	const generateMutation = trpc.generate.create.useMutation({
		onSuccess: (data) => {
			const timestamp = new Date().toISOString();
			const cost = data.cost;

			// Show fal.ai URLs immediately
			setImages(
				data.images.map((img) => ({
					key: `fal-${img.index}`,
					url: img.falUrl,
					width: img.width,
					height: img.height,
					metadata: {
						prompt: data.prompt,
						model: data.model,
						cost: (cost / data.images.length).toFixed(3),
						aspect: lastSettings?.aspect || "1:1",
						resolution: lastSettings?.resolution || "2K",
						timestamp,
					},
				}))
			);
			setError(null);

			// Persist to Stow in background — swap URLs as they complete
			persistGeneration.mutate(
				{
					images: data.images.map((img) => ({
						falUrl: img.falUrl,
						index: img.index,
					})),
					prompt: data.prompt,
					model: data.model,
					aspect: lastSettings?.aspect || "1:1",
					resolution: lastSettings?.resolution || "2K",
					cost,
					editedFrom: lastSettings?.editImageUrls?.[0],
				},
				{
					onSuccess: (persisted) => {
						setPersistError(null);
						for (const img of persisted.images) {
							const falUrl = data.images[img.index]?.falUrl;
							if (falUrl && img.url) {
								swapUrl(falUrl, img.key, img.url);
							}
						}
					},
					onError: () => {
						setPersistError(
							"Images generated but failed to save permanently. They may expire."
						);
					},
				}
			);
		},
		onError: (err) => {
			setError(err.message);
		},
	});

	const upscaleMutation = trpc.process.upscale.useMutation({
		onSuccess: (data) => {
			// Show fal URL immediately
			setImages((prev) => [
				{
					key: `fal-upscale-${Date.now()}`,
					url: data.falUrl,
					width: data.width,
					height: data.height,
					metadata: {
						type: "upscale",
						cost: data.cost.toFixed(3),
						timestamp: new Date().toISOString(),
					},
				},
				...prev,
			]);

			// Persist to Stow in background
			persistProcess.mutate(
				{
					falUrl: data.falUrl,
					type: "upscale",
					parentUrl: data.parentUrl,
					cost: data.cost.toFixed(3),
					model: data.model,
					scaleFactor: data.scaleFactor,
				},
				{
					onSuccess: (persisted) => {
						setPersistError(null);
						swapUrl(data.falUrl, persisted.key, persisted.url);
					},
					onError: () => {
						setPersistError(
							"Upscaled image failed to save permanently. It may expire."
						);
					},
				}
			);
		},
		onError: (err) => setError(err.message),
	});

	const removeBgMutation = trpc.process.removeBackground.useMutation({
		onSuccess: (data) => {
			// Show fal URL immediately
			setImages((prev) => [
				{
					key: `fal-rmbg-${Date.now()}`,
					url: data.falUrl,
					width: data.width,
					height: data.height,
					metadata: {
						type: "rmbg",
						cost: data.cost.toFixed(3),
						timestamp: new Date().toISOString(),
					},
				},
				...prev,
			]);

			// Persist to Stow in background
			persistProcess.mutate(
				{
					falUrl: data.falUrl,
					type: "rmbg",
					parentUrl: data.parentUrl,
					cost: data.cost.toFixed(3),
					model: data.model,
				},
				{
					onSuccess: (persisted) => {
						setPersistError(null);
						swapUrl(data.falUrl, persisted.key, persisted.url);
					},
					onError: () => {
						setPersistError(
							"Processed image failed to save permanently. It may expire."
						);
					},
				}
			);
		},
		onError: (err) => setError(err.message),
	});

	const varyMutation = trpc.generate.vary.useMutation({
		onSuccess: (data) => {
			const timestamp = new Date().toISOString();

			// Show fal.ai URLs immediately
			setImages(
				data.images.map((img) => ({
					key: `fal-vary-${img.index}`,
					url: img.falUrl,
					width: img.width,
					height: img.height,
					metadata: {
						type: "variation",
						prompt: data.prompt,
						cost: (data.cost / data.images.length).toFixed(3),
						timestamp,
					},
				}))
			);

			// Persist to Stow in background
			persistGeneration.mutate(
				{
					images: data.images.map((img) => ({
						falUrl: img.falUrl,
						index: img.index,
					})),
					prompt: data.prompt,
					model: data.model,
					aspect: data.aspect,
					resolution: data.resolution,
					cost: data.cost,
					editedFrom: data.parentUrl,
				},
				{
					onSuccess: (persisted) => {
						setPersistError(null);
						for (const img of persisted.images) {
							const falUrl = data.images[img.index]?.falUrl;
							if (falUrl && img.url) {
								swapUrl(falUrl, img.key, img.url);
							}
						}
					},
					onError: () => {
						setPersistError(
							"Variations failed to save permanently. They may expire."
						);
					},
				}
			);
		},
		onError: (err) => setError(err.message),
	});

	const isProcessing =
		upscaleMutation.isPending ||
		removeBgMutation.isPending ||
		varyMutation.isPending;

	const handleGenerate = (settings: GenerateSettings) => {
		setLastSettings(settings);
		setError(null);
		generateMutation.mutate({
			prompt: settings.prompt,
			model: settings.model as "gpt" | "banana" | "gemini" | "gemini3",
			aspect: settings.aspect,
			resolution: settings.resolution,
			count: settings.count,
			transparent: settings.transparent,
			editImageUrls: settings.editImageUrls,
			inputFidelity: settings.inputFidelity,
		});
	};

	const handleUpscale = (image: GeneratedImage) => {
		if (!image.url) {
			return;
		}
		setError(null);
		upscaleMutation.mutate({ imageUrl: image.url });
	};

	const handleRemoveBg = (image: GeneratedImage) => {
		if (!image.url) {
			return;
		}
		setError(null);
		removeBgMutation.mutate({ imageUrl: image.url });
	};

	const handleVary = (image: GeneratedImage) => {
		if (!image.url) {
			return;
		}
		setError(null);
		setLightboxIndex(null);
		varyMutation.mutate({
			imageUrl: image.url,
			prompt: image.metadata?.prompt,
			model: (lastSettings?.model || "banana") as
				| "gpt"
				| "banana"
				| "gemini"
				| "gemini3",
			aspect: lastSettings?.aspect || "1:1",
			resolution: lastSettings?.resolution || "2K",
		});
	};

	return (
		<div className="mx-auto max-w-2xl space-y-8">
			<GenerateForm
				isGenerating={generateMutation.isPending}
				onGenerate={handleGenerate}
			/>

			{/* Error */}
			{error && (
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm">
					{error}
					<button
						className="ml-2 text-red-300 hover:text-red-200"
						onClick={() => setError(null)}
						type="button"
					>
						Dismiss
					</button>
				</div>
			)}

			{/* Persist warning */}
			{persistError && (
				<div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
					{persistError}
					<button
						className="ml-2 text-yellow-300 hover:text-yellow-200"
						onClick={() => setPersistError(null)}
						type="button"
					>
						Dismiss
					</button>
				</div>
			)}

			{/* Processing indicator */}
			{isProcessing && (
				<div className="flex items-center gap-2 text-sm text-text-muted">
					<span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-muted/30 border-t-text-muted" />
					Processing...
				</div>
			)}

			{/* Results */}
			<ImageGrid
				images={images}
				isLoading={generateMutation.isPending}
				loadingAspect={lastSettings?.aspect}
				loadingCount={lastSettings?.count || 1}
				onImageClick={(_, index) => setLightboxIndex(index)}
				onRemoveBg={handleRemoveBg}
				onUpscale={handleUpscale}
				onVary={handleVary}
			/>

			{/* Lightbox */}
			{lightboxIndex !== null && images[lightboxIndex] && (
				<ImageLightbox
					currentIndex={lightboxIndex}
					image={images[lightboxIndex]}
					images={images}
					onClose={() => setLightboxIndex(null)}
					onNavigate={setLightboxIndex}
					onRemoveBg={handleRemoveBg}
					onUpscale={handleUpscale}
					onVary={handleVary}
				/>
			)}
		</div>
	);
}
