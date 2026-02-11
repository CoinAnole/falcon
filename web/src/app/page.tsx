"use client";

import { useEffect, useState } from "react";
import {
	GenerateForm,
	type GenerateSettings,
} from "@/components/generate-form";
import { GenerationStatus } from "@/components/generation-status";
import { HistorySidebar } from "@/components/history-sidebar";
import { type GeneratedImage, ImageGrid } from "@/components/image-grid";
import { ImageLightbox } from "@/components/image-lightbox";
import { trpc } from "@/lib/trpc";

export default function GeneratePage() {
	const [images, setImages] = useState<GeneratedImage[]>([]);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lastSettings, setLastSettings] = useState<GenerateSettings | null>(
		null
	);

	// Queue-based generation state
	const [activeJobId, setActiveJobId] = useState<string | null>(null);

	const persistProcess = trpc.process.persist.useMutation();
	const utils = trpc.useUtils();

	// Submit generation to queue
	const submitMutation = trpc.generate.submit.useMutation({
		onSuccess: (data) => {
			setActiveJobId(data.jobId);
			setImages([]);
			setError(null);
		},
		onError: (err) => setError(err.message),
	});

	// Submit variation to queue
	const submitVaryMutation = trpc.generate.submitVary.useMutation({
		onSuccess: (data) => {
			setActiveJobId(data.jobId);
			setImages([]);
			setError(null);
		},
		onError: (err) => setError(err.message),
	});

	// Poll job status
	const statusQuery = trpc.generate.status.useQuery(
		{ jobId: activeJobId ?? "" },
		{
			enabled: !!activeJobId,
			refetchInterval: (query) => {
				const status = query.state.data?.status;
				if (!status) {
					return 1000;
				}
				if (status === "completed" || status === "failed") {
					return false;
				}
				return 1000;
			},
			refetchIntervalInBackground: true,
		}
	);

	// Complete job (persist to Stow)
	const completeMutation = trpc.generate.complete.useMutation({
		onSuccess: (data) => {
			setImages(
				data.images.map((img) => ({
					key: img.stowKey,
					url: img.url,
					width: img.width,
					height: img.height,
					metadata: {
						prompt: img.prompt || "",
						model: img.model || "",
						aspect: img.aspect || "",
						resolution: img.resolution || "",
						cost: img.cost || "",
					},
				}))
			);
			setActiveJobId(null);
			utils.gallery.list.invalidate();
		},
		onError: (err) => {
			// Retry after delay if completion is in progress
			if (
				err.message.includes("being completed") ||
				err.message.includes("retrying")
			) {
				setTimeout(() => {
					if (activeJobId) {
						completeMutation.mutate({ jobId: activeJobId });
					}
				}, 2000);
				return;
			}
			setError(err.message);
			setActiveJobId(null);
		},
	});

	// React to status changes
	useEffect(() => {
		if (!(statusQuery.data && activeJobId)) {
			return;
		}

		const { status } = statusQuery.data;

		if (status === "ready_to_complete" && !completeMutation.isPending) {
			completeMutation.mutate({ jobId: activeJobId });
		}

		if (status === "completed" && "images" in statusQuery.data) {
			// Already completed (e.g. page refresh) — load images directly
			setImages(
				statusQuery.data.images.map((img) => ({
					key: img.stowKey,
					url: img.url,
					width: img.width,
					height: img.height,
					metadata: {
						prompt: img.prompt || "",
						model: img.model || "",
						aspect: img.aspect || "",
						resolution: img.resolution || "",
						cost: img.cost || "",
					},
				}))
			);
			setActiveJobId(null);
			utils.gallery.list.invalidate();
		}

		if (status === "failed" && "error" in statusQuery.data) {
			setError(statusQuery.data.error);
			setActiveJobId(null);
		}
	}, [statusQuery.data, activeJobId, completeMutation, utils.gallery.list]);

	// Process operations (stay synchronous)
	const upscaleMutation = trpc.process.upscale.useMutation({
		onSuccess: (data) => {
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
						setImages((prev) =>
							prev.map((img) =>
								img.url === data.falUrl
									? {
											...img,
											key: persisted.key,
											url: persisted.url || img.url,
										}
									: img
							)
						);
						utils.gallery.list.invalidate();
					},
				}
			);
		},
		onError: (err) => setError(err.message),
	});

	const removeBgMutation = trpc.process.removeBackground.useMutation({
		onSuccess: (data) => {
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
						setImages((prev) =>
							prev.map((img) =>
								img.url === data.falUrl
									? {
											...img,
											key: persisted.key,
											url: persisted.url || img.url,
										}
									: img
							)
						);
						utils.gallery.list.invalidate();
					},
				}
			);
		},
		onError: (err) => setError(err.message),
	});

	const isProcessing = upscaleMutation.isPending || removeBgMutation.isPending;

	const handleGenerate = (settings: GenerateSettings) => {
		setLastSettings(settings);
		setError(null);
		submitMutation.mutate({
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
		submitVaryMutation.mutate({
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

	const handleHistorySelect = (item: {
		key: string;
		url: string | null;
		metadata?: Record<string, string>;
	}) => {
		if (!item.url) {
			return;
		}
		setImages([
			{
				key: item.key,
				url: item.url,
				metadata: item.metadata,
			},
		]);
	};

	const activeImageKey = images[0]?.key;
	const isGenerating = !!activeJobId;
	const jobStatus = statusQuery.data;

	const getGenerationStatus = ():
		| "queued"
		| "processing"
		| "completing"
		| "ready_to_complete"
		| null => {
		if (isGenerating && jobStatus) {
			const s = jobStatus.status;
			if (
				s === "queued" ||
				s === "processing" ||
				s === "completing" ||
				s === "ready_to_complete"
			) {
				return s;
			}
		}
		if (
			submitMutation.isPending ||
			submitVaryMutation.isPending ||
			(isGenerating && !jobStatus)
		) {
			return "queued";
		}
		return null;
	};

	const generationStatus = getGenerationStatus();

	const renderCanvas = () => {
		if (generationStatus) {
			return (
				<GenerationStatus
					logs={jobStatus && "logs" in jobStatus ? jobStatus.logs : undefined}
					queuePosition={
						jobStatus && "queuePosition" in jobStatus
							? jobStatus.queuePosition
							: undefined
					}
					startedAt={
						jobStatus && "startedAt" in jobStatus
							? jobStatus.startedAt
							: undefined
					}
					status={generationStatus}
				/>
			);
		}

		if (isProcessing) {
			return (
				<div className="flex flex-col items-center gap-3">
					<span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
					<p className="text-sm text-text-tertiary">Processing...</p>
				</div>
			);
		}

		if (images.length > 0) {
			return (
				<div className="w-full max-w-3xl">
					<ImageGrid
						images={images}
						onImageClick={(_, index) => setLightboxIndex(index)}
						onRemoveBg={handleRemoveBg}
						onUpscale={handleUpscale}
						onVary={handleVary}
					/>
				</div>
			);
		}

		return (
			<div className="flex flex-col items-center gap-2 text-center">
				<p className="text-sm text-text-tertiary">
					Describe what you want to see
				</p>
				<p className="text-text-tertiary text-xs">and press Generate</p>
			</div>
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
					<a
						className="text-text-tertiary text-xs transition-colors hover:text-text-secondary"
						href="/gallery"
					>
						Gallery
					</a>
				</div>
			</nav>

			{/* Main 3-column layout */}
			<div className="flex min-h-0 flex-1">
				{/* Left sidebar — controls */}
				<aside className="flex w-[280px] shrink-0 flex-col border-border-subtle border-r bg-surface">
					<div className="flex-1 overflow-y-auto p-4">
						<GenerateForm
							isGenerating={submitMutation.isPending || isGenerating}
							onGenerate={handleGenerate}
						/>
					</div>
				</aside>

				{/* Center canvas */}
				<main className="flex min-w-0 flex-1 flex-col">
					{/* Error messages */}
					{error && (
						<div className="mx-4 mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-danger text-sm">
							{error}
							<button
								className="ml-2 text-danger/70 hover:text-danger"
								onClick={() => setError(null)}
								type="button"
							>
								Dismiss
							</button>
						</div>
					)}

					{/* Canvas content */}
					<div className="flex flex-1 items-start justify-center overflow-y-auto p-6 pt-[20vh]">
						{renderCanvas()}
					</div>

					{/* Footer shortcuts */}
					<div className="shrink-0 border-border-subtle border-t px-4 py-2">
						<p className="text-[11px] text-text-tertiary">
							{"\u2318"}+Enter generate &middot; Esc close
						</p>
					</div>
				</main>

				{/* Right sidebar — history */}
				<aside className="flex w-[240px] shrink-0 flex-col border-border-subtle border-l bg-surface">
					<div className="shrink-0 border-border-subtle border-b px-4 py-2.5">
						<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
							History
						</p>
					</div>
					<div className="flex-1 overflow-y-auto">
						<HistorySidebar
							activeKey={activeImageKey}
							onSelect={handleHistorySelect}
						/>
					</div>
				</aside>
			</div>

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
