import { Text } from "ink";
import { useEffect, useRef, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface SpinnerProps {
	text: string;
}

export function Spinner({ text }: SpinnerProps) {
	const [frame, setFrame] = useState(0);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const tick = () => {
			setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
			timeoutRef.current = setTimeout(tick, 80);
		};
		timeoutRef.current = setTimeout(tick, 80);

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	return (
		<Text color="magenta">
			{SPINNER_FRAMES[frame]} {text}
		</Text>
	);
}
