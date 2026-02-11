"use client";

import { useEffect, useState } from "react";

interface GenerationStatusProps {
	status: "queued" | "processing" | "completing" | "ready_to_complete";
	queuePosition?: number;
	logs?: { message: string; timestamp: string }[];
	startedAt?: string;
}

function useElapsedTime(startedAt: string | undefined, active: boolean) {
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		if (!(active && startedAt)) {
			setElapsed(0);
			return;
		}

		const start = new Date(startedAt).getTime();
		const tick = () => {
			setElapsed(Math.floor((Date.now() - start) / 1000));
		};
		tick();
		const interval = setInterval(tick, 1000);
		return () => clearInterval(interval);
	}, [startedAt, active]);

	return elapsed;
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GenerationStatus({
	status,
	queuePosition,
	logs,
	startedAt,
}: GenerationStatusProps) {
	const isProcessing =
		status === "processing" || status === "ready_to_complete";
	const elapsed = useElapsedTime(startedAt, isProcessing);

	const lastLog = logs?.at(-1)?.message;

	return (
		<div className="flex flex-col items-center gap-3">
			{/* Main display */}
			<p
				className="font-light font-mono text-zinc-300 leading-none transition-opacity duration-150"
				style={{ fontSize: "min(120px, 15vw)" }}
			>
				{status === "queued" && (queuePosition ?? "—")}
				{isProcessing && formatTime(elapsed)}
				{status === "completing" && "DONE"}
			</p>

			{/* Status label */}
			<p className="font-medium text-[10px] text-text-tertiary uppercase tracking-widest">
				{status === "queued" && "In queue"}
				{status === "processing" && "Generating"}
				{status === "ready_to_complete" && "Generating"}
				{status === "completing" && "Saving"}
			</p>

			{/* Log line */}
			{lastLog && (
				<p className="max-w-md truncate font-mono text-[11px] text-zinc-400/50 transition-opacity duration-150">
					{lastLog}
				</p>
			)}
		</div>
	);
}
