"use client";

import Image from "next/image";
import { trpc } from "@/lib/trpc";

interface HistoryItem {
	key: string;
	url: string | null;
	metadata?: Record<string, string>;
}

interface HistorySidebarProps {
	activeKey?: string;
	onSelect: (item: HistoryItem) => void;
}

export function HistorySidebar({ activeKey, onSelect }: HistorySidebarProps) {
	const { data, isLoading } = trpc.gallery.list.useInfiniteQuery(
		{ limit: 20 },
		{
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		}
	);

	const items: HistoryItem[] =
		data?.pages.flatMap((page) =>
			page.images.map((img) => ({
				key: img.key,
				url: img.url,
				metadata: img.metadata,
			}))
		) || [];

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2 p-3">
				{Array.from({ length: 6 }, (_, i) => `history-sk-${i}`).map((key) => (
					<div className="flex gap-2.5" key={key}>
						<div className="skeleton h-10 w-10 shrink-0 rounded-md" />
						<div className="flex flex-1 flex-col gap-1.5 py-0.5">
							<div className="skeleton h-3 w-3/4 rounded" />
							<div className="skeleton h-2.5 w-1/2 rounded" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
				<p className="text-sm text-text-tertiary">No history yet</p>
				<p className="text-text-tertiary text-xs">
					Generated images will appear here
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-0.5 p-2">
			{items.map((item) => {
				const isActive = item.key === activeKey;
				const prompt = item.metadata?.prompt || "";
				const model = item.metadata?.model || "";
				const aspect = item.metadata?.aspect || "";

				return (
					<button
						className={`flex gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
							isActive ? "bg-surface-2" : "hover:bg-surface-2"
						}`}
						key={item.key}
						onClick={() => onSelect(item)}
						type="button"
					>
						{item.url ? (
							<Image
								alt=""
								className="h-10 w-10 shrink-0 rounded-md object-cover"
								height={40}
								src={`${item.url}?w=80&f=webp`}
								width={40}
							/>
						) : (
							<div className="h-10 w-10 shrink-0 rounded-md bg-surface-2" />
						)}
						<div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
							<p
								className={`truncate text-xs leading-tight ${isActive ? "text-text" : "text-text-secondary"}`}
							>
								{prompt.slice(0, 50) || "Untitled"}
							</p>
							<p className="text-[10px] text-text-tertiary">
								{model}
								{aspect ? ` \u00b7 ${aspect}` : ""}
							</p>
						</div>
					</button>
				);
			})}
		</div>
	);
}
