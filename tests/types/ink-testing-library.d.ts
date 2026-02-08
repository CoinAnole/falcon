declare module "ink-testing-library" {
	import type { ReactNode } from "react";

	export interface RenderResult {
		stdin: { write: (data: string) => void };
		lastFrame: () => string | undefined;
		unmount: () => void;
	}

	export function render(node: ReactNode): RenderResult;
}
