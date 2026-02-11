const mode = process.env.FALCON_TEST_RUNCLI_MODE ?? "success";
const attempt = Number(process.env.FALCON_RUNCLI_ATTEMPT ?? "1");

if (mode === "timeout-once" && attempt === 1) {
	await new Promise(() => {});
}

if (mode === "timeout-always") {
	await new Promise(() => {});
}

if (mode === "timeout-with-stderr") {
	console.error("fixture-timeout");
	await new Promise(() => {});
}

process.exit(0);
