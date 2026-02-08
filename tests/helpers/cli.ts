import { getTestHome } from "./env";

export interface CliResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export async function runCli(
	args: string[],
	envOverrides: Record<string, string> = {},
): Promise<CliResult> {
	const proc = Bun.spawn(["bun", "src/index.ts", ...args], {
		cwd: process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			HOME: getTestHome(),
			...envOverrides,
		},
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout!).text(),
		new Response(proc.stderr!).text(),
		proc.exited,
	]);

	return { exitCode, stdout, stderr };
}
