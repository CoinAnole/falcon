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
	"1:1": { w: 14, h: 14 },
	"4:3": { w: 16, h: 12 },
	"3:4": { w: 12, h: 16 },
	"16:9": { w: 18, h: 10 },
	"9:16": { w: 10, h: 18 },
	"3:2": { w: 16, h: 11 },
	"2:3": { w: 11, h: 16 },
	"4:5": { w: 12, h: 15 },
	"5:4": { w: 15, h: 12 },
	"21:9": { w: 20, h: 9 },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

	useEffect(() => {
		if (editImagePreviews.length > maxRef) {
			setEditImagePreviews((prev) => prev.slice(0, maxRef));
		}
	}, [maxRef, editImagePreviews.length]);

	const buildSettings = (): GenerateSettings => ({
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

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || isGenerating) {
			return;
		}
		onGenerate(buildSettings());
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			if (prompt.trim() && !isGenerating) {
				onGenerate(buildSettings());
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
				const { uploadUrl, fileKey } = await getUploadUrl.mutateAsync({
					contentType: file.type,
					fileName: file.name,
					size: file.size,
				});

				const putRes = await fetch(uploadUrl, {
					method: "PUT",
					headers: { "Content-Type": file.type },
					body: file,
				});

				if (!putRes.ok) {
					throw new Error("Upload failed");
				}

				const { url } = await confirmUpload.mutateAsync({
					fileKey,
					size: file.size,
					contentType: file.type,
				});

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
			const validFiles = files.filter(
				(f) => f.type.startsWith("image/") && f.size <= MAX_FILE_SIZE
			);
			const available = maxRef - editImagePreviews.length;
			const toAdd = validFiles.slice(0, available);
			const startIndex = editImagePreviews.length;

			const newPreviews: EditImagePreview[] = toAdd.map((file) => ({
				blobUrl: URL.createObjectURL(file),
				status: "uploading" as const,
				file,
			}));

			setEditImagePreviews((prev) => [...prev, ...newPreviews]);
			for (let i = 0; i < toAdd.length; i++) {
				uploadFile(toAdd[i], startIndex + i);
			}
		},
		[maxRef, editImagePreviews.length, uploadFile]
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			addFiles(Array.from(e.dataTransfer.files));
		},
		[addFiles]
	);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			addFiles(Array.from(e.target.files || []));
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
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			{/* Prompt */}
			<div>
				<textarea
					className="w-full resize-none rounded-lg bg-white px-3 py-2.5 text-[13px] text-text ring-1 ring-border placeholder:text-text-tertiary focus:outline-none focus:ring-accent"
					onChange={(e) => setPrompt(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Describe what you want to see..."
					rows={3}
					value={prompt}
				/>
			</div>

			{/* Model */}
			<div className="space-y-1.5">
				<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
					Model
				</p>
				<div className="flex flex-wrap gap-1">
					{GENERATION_MODELS.map((key) => {
						const m = MODELS[key];
						return (
							<button
								className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
									model === key
										? "bg-surface-2 font-medium text-text"
										: "text-text-secondary hover:bg-surface-2 hover:text-text"
								}`}
								key={key}
								onClick={() => setModel(key)}
								type="button"
							>
								{m.name}
								<span className="ml-1 font-mono text-[10px] opacity-50">
									{m.pricing}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Aspect ratio */}
			<div className="space-y-1.5">
				<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
					Aspect ratio
				</p>
				<div className="flex flex-wrap items-center gap-1">
					{primaryAspects.map((r) => {
						const shape = ASPECT_SHAPES[r] || { w: 14, h: 14 };
						return (
							<button
								className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors ${
									aspect === r
										? "bg-surface-2 font-medium text-text"
										: "text-text-secondary hover:bg-surface-2 hover:text-text"
								}`}
								key={r}
								onClick={() => setAspect(r)}
								type="button"
							>
								<div
									className={`rounded-[2px] ${aspect === r ? "bg-text" : "bg-text-tertiary/40"}`}
									style={{ width: shape.w, height: shape.h }}
								/>
								<span className="text-[10px]">{r}</span>
							</button>
						);
					})}
					<button
						className="rounded-md bg-surface-2 px-2 py-1.5 text-[10px] text-text-tertiary transition-colors hover:text-text-secondary"
						onClick={() => setShowMoreAspects(!showMoreAspects)}
						type="button"
					>
						{showMoreAspects ? "Less" : "More"}
					</button>
				</div>
				{showMoreAspects && (
					<div className="flex flex-wrap gap-1 pt-0.5">
						{moreAspects.map((r) => {
							const shape = ASPECT_SHAPES[r] || { w: 14, h: 14 };
							return (
								<button
									className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors ${
										aspect === r
											? "bg-surface-2 font-medium text-text"
											: "text-text-secondary hover:bg-surface-2 hover:text-text"
									}`}
									key={r}
									onClick={() => setAspect(r)}
									type="button"
								>
									<div
										className={`rounded-[2px] ${aspect === r ? "bg-text" : "bg-text-tertiary/40"}`}
										style={{ width: shape.w, height: shape.h }}
									/>
									<span className="text-[10px]">{r}</span>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Resolution + Count + Transparent */}
			<div className="flex gap-4">
				{modelConfig?.supportsResolution && (
					<div className="space-y-1.5">
						<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
							Resolution
						</p>
						<div className="flex gap-1">
							{RESOLUTIONS.map((r) => (
								<button
									className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
										resolution === r
											? "bg-surface-2 font-medium text-text"
											: "text-text-secondary hover:bg-surface-2 hover:text-text"
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

				<div className="space-y-1.5">
					<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
						Count
					</p>
					<div className="flex gap-1">
						{[1, 2, 3, 4].map((n) => (
							<button
								className={`w-7 rounded-md py-1 text-center text-[12px] transition-colors ${
									count === n
										? "bg-surface-2 font-medium text-text"
										: "text-text-secondary hover:bg-surface-2 hover:text-text"
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

				{model === "gpt" && (
					<div className="space-y-1.5">
						<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
							BG
						</p>
						<button
							className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
								transparent
									? "bg-surface-2 font-medium text-text"
									: "text-text-secondary hover:bg-surface-2 hover:text-text"
							}`}
							onClick={() => setTransparent(!transparent)}
							type="button"
						>
							Clear
						</button>
					</div>
				)}
			</div>

			{/* Presets */}
			<div className="flex flex-wrap gap-1">
				{Object.entries(FORMAT_PRESETS).map(([key, preset]) => (
					<button
						className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-text-tertiary transition-colors hover:text-text-secondary"
						key={key}
						onClick={() => applyPreset(key)}
						type="button"
					>
						{preset.label}
					</button>
				))}
			</div>

			{/* Reference images */}
			<div className="space-y-1.5">
				{editImagePreviews.length > 0 && (
					<>
						<div className="flex items-center justify-between">
							<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
								References
							</p>
							<span className="font-mono text-[10px] text-text-tertiary">
								{editImagePreviews.length}/{maxRef}
							</span>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{editImagePreviews.map((preview, index) => (
								<div className="group relative" key={preview.blobUrl}>
									{/* biome-ignore lint/performance/noImgElement: blob URLs incompatible with next/image */}
									<img
										alt={`Reference ${index + 1}`}
										className="h-12 w-12 rounded-md object-cover"
										height={48}
										src={preview.blobUrl}
										width={48}
									/>
									{preview.status === "uploading" && (
										<div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
											<span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
										</div>
									)}
									{preview.status === "ready" && (
										<div className="absolute right-0 bottom-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success text-[8px] text-white">
											&#10003;
										</div>
									)}
									{preview.status === "error" && (
										<div className="absolute inset-0 flex items-center justify-center rounded-md bg-danger/30">
											<button
												className="font-medium text-[10px] text-danger hover:text-white"
												onClick={() => retryUpload(index)}
												type="button"
											>
												Retry
											</button>
										</div>
									)}
									<button
										className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-surface-2 text-[10px] text-text-tertiary hover:text-text group-hover:flex"
										onClick={() => removeEditImage(index)}
										type="button"
									>
										&#215;
									</button>
								</div>
							))}
						</div>
					</>
				)}

				{editImagePreviews.length < maxRef && (
					<button
						className="w-full rounded-lg border border-border border-dashed bg-transparent py-2 text-[12px] text-text-tertiary transition-colors hover:border-text-tertiary hover:text-text-secondary"
						onClick={() => fileInputRef.current?.click()}
						onDragOver={(e) => e.preventDefault()}
						onDrop={handleDrop}
						type="button"
					>
						+ Reference{maxRef > 1 ? ` (up to ${maxRef})` : ""}
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

				{model === "gpt" && editImagePreviews.length > 0 && (
					<div className="flex gap-1">
						<button
							className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
								inputFidelity === "high"
									? "bg-surface-2 font-medium text-text"
									: "text-text-secondary hover:bg-surface-2 hover:text-text"
							}`}
							onClick={() => setInputFidelity("high")}
							type="button"
						>
							Match composition
						</button>
						<button
							className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
								inputFidelity === "low"
									? "bg-surface-2 font-medium text-text"
									: "text-text-secondary hover:bg-surface-2 hover:text-text"
							}`}
							onClick={() => setInputFidelity("low")}
							type="button"
						>
							Inspiration
						</button>
					</div>
				)}
			</div>

			{/* Generate button */}
			<button
				className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 font-medium text-[13px] text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
				disabled={!prompt.trim() || isGenerating}
				type="submit"
			>
				{isGenerating ? (
					<>
						<span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
						Generating...
					</>
				) : (
					<>
						Generate
						<span className="font-mono text-[11px] opacity-60">
							~${cost.toFixed(2)}
						</span>
					</>
				)}
			</button>
		</form>
	);
}
