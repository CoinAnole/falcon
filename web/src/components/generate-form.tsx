"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	ASPECT_RATIOS,
	type AspectRatio,
	estimateCost,
	FORMAT_PRESETS,
	GENERATION_MODELS,
	MODELS,
	RESOLUTIONS,
	type Resolution,
} from "@/lib/models";
import { trpc } from "@/lib/trpc";

export interface GenerateSettings {
	prompt: string;
	model: string;
	aspect: AspectRatio;
	resolution: Resolution;
	count: number;
	transparent: boolean;
	editImageUrls?: string[];
	inputFidelity?: "low" | "high";
}

interface GenerateFormProps {
	onGenerate: (settings: GenerateSettings) => void;
	isGenerating: boolean;
}

interface EditImagePreview {
	blobUrl: string;
	stowUrl?: string;
	status: "uploading" | "ready" | "error";
	file?: File;
}

const ASPECT_SHAPES: Record<string, { w: number; h: number }> = {
	"1:1": { w: 20, h: 20 },
	"4:3": { w: 24, h: 18 },
	"3:4": { w: 18, h: 24 },
	"16:9": { w: 28, h: 16 },
	"9:16": { w: 16, h: 28 },
	"3:2": { w: 24, h: 16 },
	"2:3": { w: 16, h: 24 },
	"4:5": { w: 18, h: 22 },
	"5:4": { w: 22, h: 18 },
	"21:9": { w: 32, h: 14 },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function GenerateForm({ onGenerate, isGenerating }: GenerateFormProps) {
	const [prompt, setPrompt] = useState("");
	const [model, setModel] = useState("banana");
	const [aspect, setAspect] = useState<AspectRatio>("1:1");
	const [resolution, setResolution] = useState<Resolution>("2K");
	const [count, setCount] = useState(1);
	const [transparent, setTransparent] = useState(false);
	const [showMoreAspects, setShowMoreAspects] = useState(false);
	const [editImagePreviews, setEditImagePreviews] = useState<
		EditImagePreview[]
	>([]);
	const [inputFidelity, setInputFidelity] = useState<"low" | "high">("high");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const getUploadUrl = trpc.generate.getUploadUrl.useMutation();
	const confirmUpload = trpc.generate.confirmUpload.useMutation();

	const cost = estimateCost(model, resolution, count);
	const primaryAspects = ASPECT_RATIOS.slice(0, 5);
	const moreAspects = ASPECT_RATIOS.slice(5);
	const modelConfig = MODELS[model];
	const maxRef = modelConfig?.maxReferenceImages || 1;
	const readyUrls = editImagePreviews
		.filter((p) => p.status === "ready" && p.stowUrl)
		.map((p) => p.stowUrl as string);

	// Trim excess images when switching to a model with lower maxReferenceImages
	useEffect(() => {
		if (editImagePreviews.length > maxRef) {
			setEditImagePreviews((prev) => prev.slice(0, maxRef));
		}
	}, [maxRef, editImagePreviews.length]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || isGenerating) {
			return;
		}
		onGenerate({
			prompt,
			model,
			aspect,
			resolution,
			count,
			transparent,
			editImageUrls: readyUrls.length > 0 ? readyUrls : undefined,
			inputFidelity:
				readyUrls.length > 0 && model === "gpt" ? inputFidelity : undefined,
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			if (prompt.trim() && !isGenerating) {
				onGenerate({
					prompt,
					model,
					aspect,
					resolution,
					count,
					transparent,
					editImageUrls: readyUrls.length > 0 ? readyUrls : undefined,
					inputFidelity:
						readyUrls.length > 0 && model === "gpt" ? inputFidelity : undefined,
				});
			}
		}
	};

	const applyPreset = (key: string) => {
		const preset = FORMAT_PRESETS[key];
		if (!preset) {
			return;
		}
		setAspect(preset.aspect);
		if (preset.resolution) {
			setResolution(preset.resolution);
		}
	};

	const uploadFile = useCallback(
		async (file: File, index: number) => {
			try {
				// Get presigned URL
				const { uploadUrl, fileKey } = await getUploadUrl.mutateAsync({
					contentType: file.type,
					fileName: file.name,
					size: file.size,
				});

				// PUT directly to R2
				const putRes = await fetch(uploadUrl, {
					method: "PUT",
					headers: { "Content-Type": file.type },
					body: file,
				});

				if (!putRes.ok) {
					throw new Error("Upload failed");
				}

				// Confirm upload
				const { url } = await confirmUpload.mutateAsync({
					fileKey,
					size: file.size,
					contentType: file.type,
				});

				// Update state with Stow URL
				setEditImagePreviews((prev) =>
					prev.map((p, i) =>
						i === index
							? { ...p, status: "ready" as const, stowUrl: url ?? undefined }
							: p
					)
				);
			} catch {
				setEditImagePreviews((prev) =>
					prev.map((p, i) =>
						i === index ? { ...p, status: "error" as const } : p
					)
				);
			}
		},
		[getUploadUrl, confirmUpload]
	);

	const addFiles = useCallback(
		(files: File[]) => {
			const validFiles = files.filter((f) => {
				if (!f.type.startsWith("image/")) {
					return false;
				}
				if (f.size > MAX_FILE_SIZE) {
					return false;
				}
				return true;
			});

			const available = maxRef - editImagePreviews.length;
			const toAdd = validFiles.slice(0, available);

			const startIndex = editImagePreviews.length;
			const newPreviews: EditImagePreview[] = toAdd.map((file) => ({
				blobUrl: URL.createObjectURL(file),
				status: "uploading" as const,
				file,
			}));

			setEditImagePreviews((prev) => [...prev, ...newPreviews]);

			// Start uploads
			toAdd.forEach((file, i) => {
				uploadFile(file, startIndex + i);
			});
		},
		[maxRef, editImagePreviews.length, uploadFile]
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			const files = Array.from(e.dataTransfer.files);
			addFiles(files);
		},
		[addFiles]
	);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files || []);
			addFiles(files);
			// Reset input so the same file can be selected again
			e.target.value = "";
		},
		[addFiles]
	);

	const removeEditImage = (index: number) => {
		setEditImagePreviews((prev) => {
			const removed = prev[index];
			if (removed?.blobUrl) {
				URL.revokeObjectURL(removed.blobUrl);
			}
			return prev.filter((_, i) => i !== index);
		});
	};

	const retryUpload = (index: number) => {
		const preview = editImagePreviews[index];
		if (!preview?.file) {
			return;
		}
		setEditImagePreviews((prev) =>
			prev.map((p, i) =>
				i === index ? { ...p, status: "uploading" as const } : p
			)
		);
		uploadFile(preview.file, index);
	};

	return (
		<form className="space-y-5" onSubmit={handleSubmit}>
			{/* Prompt */}
			<div>
				<textarea
					className="w-full resize-none rounded-lg border border-border bg-surface px-4 py-3 text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
					onChange={(e) => setPrompt(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Describe what you want to see..."
					rows={3}
					value={prompt}
				/>
			</div>

			{/* Model selector */}
			<div className="space-y-2">
				<span className="font-medium text-text-muted text-xs uppercase tracking-wider">
					Model
				</span>
				<div className="flex flex-wrap gap-2">
					{GENERATION_MODELS.map((key) => {
						const m = MODELS[key];
						return (
							<button
								className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
									model === key
										? "border-accent bg-accent/10 text-accent"
										: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
								}`}
								key={key}
								onClick={() => setModel(key)}
								type="button"
							>
								{m.name}
								<span className="ml-1.5 text-xs opacity-60">{m.pricing}</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Aspect ratio */}
			<div className="space-y-2">
				<span className="font-medium text-text-muted text-xs uppercase tracking-wider">
					Aspect Ratio
				</span>
				<div className="flex flex-wrap items-center gap-2">
					{primaryAspects.map((r) => {
						const shape = ASPECT_SHAPES[r] || { w: 20, h: 20 };
						return (
							<button
								className={`flex flex-col items-center gap-1 rounded-md border px-3 py-2 transition-colors ${
									aspect === r
										? "border-accent bg-accent/10 text-accent"
										: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
								}`}
								key={r}
								onClick={() => setAspect(r)}
								type="button"
							>
								<div
									className={`rounded-sm ${aspect === r ? "bg-accent/40" : "bg-text-muted/30"}`}
									style={{ width: shape.w, height: shape.h }}
								/>
								<span className="text-xs">{r}</span>
							</button>
						);
					})}
					<button
						className="rounded-md border border-border bg-surface px-3 py-2 text-text-muted text-xs transition-colors hover:text-text"
						onClick={() => setShowMoreAspects(!showMoreAspects)}
						type="button"
					>
						{showMoreAspects ? "Less" : "More"}
					</button>
				</div>
				{showMoreAspects && (
					<div className="flex flex-wrap gap-2 pt-1">
						{moreAspects.map((r) => {
							const shape = ASPECT_SHAPES[r] || { w: 20, h: 20 };
							return (
								<button
									className={`flex flex-col items-center gap-1 rounded-md border px-3 py-2 transition-colors ${
										aspect === r
											? "border-accent bg-accent/10 text-accent"
											: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
									}`}
									key={r}
									onClick={() => setAspect(r)}
									type="button"
								>
									<div
										className={`rounded-sm ${aspect === r ? "bg-accent/40" : "bg-text-muted/30"}`}
										style={{ width: shape.w, height: shape.h }}
									/>
									<span className="text-xs">{r}</span>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Resolution + Count row */}
			<div className="flex gap-6">
				{/* Resolution */}
				{modelConfig?.supportsResolution && (
					<div className="space-y-2">
						<span className="font-medium text-text-muted text-xs uppercase tracking-wider">
							Resolution
						</span>
						<div className="flex gap-1">
							{RESOLUTIONS.map((r) => (
								<button
									className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
										resolution === r
											? "border-accent bg-accent/10 text-accent"
											: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
									}`}
									key={r}
									onClick={() => setResolution(r)}
									type="button"
								>
									{r}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Count */}
				<div className="space-y-2">
					<span className="font-medium text-text-muted text-xs uppercase tracking-wider">
						Count
					</span>
					<div className="flex gap-1">
						{[1, 2, 3, 4].map((n) => (
							<button
								className={`w-9 rounded-md border py-1.5 text-center text-sm transition-colors ${
									count === n
										? "border-accent bg-accent/10 text-accent"
										: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
								}`}
								key={n}
								onClick={() => setCount(n)}
								type="button"
							>
								{n}
							</button>
						))}
					</div>
				</div>

				{/* Transparent (GPT only) */}
				{model === "gpt" && (
					<div className="space-y-2">
						<span className="font-medium text-text-muted text-xs uppercase tracking-wider">
							Background
						</span>
						<button
							className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
								transparent
									? "border-accent bg-accent/10 text-accent"
									: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
							}`}
							onClick={() => setTransparent(!transparent)}
							type="button"
						>
							Transparent
						</button>
					</div>
				)}
			</div>

			{/* Format presets */}
			<div className="flex flex-wrap gap-2">
				{Object.entries(FORMAT_PRESETS).map(([key, preset]) => (
					<button
						className="rounded-full border border-border bg-surface px-3 py-1 text-text-muted text-xs transition-colors hover:border-text-muted hover:text-text"
						key={key}
						onClick={() => applyPreset(key)}
						type="button"
					>
						{preset.label}
					</button>
				))}
			</div>

			{/* Reference images */}
			<div className="space-y-2">
				{editImagePreviews.length > 0 && (
					<>
						<div className="flex items-center justify-between">
							<span className="font-medium text-text-muted text-xs uppercase tracking-wider">
								Reference Images
							</span>
							<span className="text-text-muted text-xs">
								{editImagePreviews.length}/{maxRef}
							</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{editImagePreviews.map((preview, index) => (
								<div className="group relative" key={preview.blobUrl}>
									{/* biome-ignore lint/performance/noImgElement: blob URLs are incompatible with next/image */}
									<img
										alt={`Reference ${index + 1}`}
										className="h-16 w-16 rounded-md object-cover"
										height={64}
										src={preview.blobUrl}
										width={64}
									/>
									{/* Upload status overlay */}
									{preview.status === "uploading" && (
										<div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
											<span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
										</div>
									)}
									{preview.status === "ready" && (
										<div className="absolute right-0.5 bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] text-white">
											✓
										</div>
									)}
									{preview.status === "error" && (
										<div className="absolute inset-0 flex items-center justify-center rounded-md bg-red-500/30">
											<button
												className="font-medium text-red-300 text-xs hover:text-white"
												onClick={() => retryUpload(index)}
												type="button"
											>
												Retry
											</button>
										</div>
									)}
									{/* Remove button */}
									<button
										className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-muted text-xs hover:text-text group-hover:flex"
										onClick={() => removeEditImage(index)}
										type="button"
									>
										×
									</button>
								</div>
							))}
						</div>
					</>
				)}

				{/* Add reference image button / drop zone */}
				{editImagePreviews.length < maxRef && (
					<button
						className="w-full rounded-lg border border-border border-dashed bg-surface/50 px-4 py-3 text-sm text-text-muted transition-colors hover:border-text-muted hover:text-text"
						onClick={() => fileInputRef.current?.click()}
						onDragOver={(e) => e.preventDefault()}
						onDrop={handleDrop}
						type="button"
					>
						+ Add reference image{maxRef > 1 ? ` (up to ${maxRef})` : ""}
					</button>
				)}

				<input
					accept="image/*"
					className="hidden"
					multiple
					onChange={handleFileSelect}
					ref={fileInputRef}
					type="file"
				/>

				{/* Input fidelity toggle (GPT + reference images) */}
				{model === "gpt" && editImagePreviews.length > 0 && (
					<div className="flex gap-1">
						<button
							className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
								inputFidelity === "high"
									? "border-accent bg-accent/10 text-accent"
									: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
							}`}
							onClick={() => setInputFidelity("high")}
							type="button"
						>
							Match composition
						</button>
						<button
							className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
								inputFidelity === "low"
									? "border-accent bg-accent/10 text-accent"
									: "border-border bg-surface text-text-muted hover:border-text-muted hover:text-text"
							}`}
							onClick={() => setInputFidelity("low")}
							type="button"
						>
							Use as inspiration
						</button>
					</div>
				)}
			</div>

			{/* Generate button */}
			<button
				className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
				disabled={!prompt.trim() || isGenerating}
				type="submit"
			>
				{isGenerating ? (
					<>
						<span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
						Generating...
					</>
				) : (
					<>
						Generate
						<span className="text-sm opacity-75">~${cost.toFixed(2)}</span>
					</>
				)}
			</button>
			{!isGenerating && (
				<p className="text-center text-text-muted text-xs">
					{"\u2318"}+Enter to generate
				</p>
			)}
		</form>
	);
}
