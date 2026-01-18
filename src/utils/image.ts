import { existsSync } from "fs";
import { basename, extname } from "path";

/**
 * Download an image from a URL and save it to a file
 */
export async function downloadImage(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await Bun.write(outputPath, buffer);
}

/**
 * Convert a local image file to a base64 data URL
 */
export async function imageToDataUrl(imagePath: string): Promise<string> {
  if (!existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const file = Bun.file(imagePath);
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const ext = extname(imagePath).toLowerCase();
  const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Resize an image using sips (macOS) or sharp
 * Returns the path to the resized image (temp file if resized)
 */
export async function resizeImage(imagePath: string, maxSize: number = 1024): Promise<string> {
  const tempPath = `/tmp/falky-resize-${Date.now()}.png`;

  // Try sips first (macOS)
  try {
    const proc = Bun.spawn(["sips", "-Z", String(maxSize), imagePath, "--out", tempPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode === 0 && existsSync(tempPath)) {
      return tempPath;
    }
  } catch {
    // sips not available, fall through
  }

  // If sips fails, just use the original
  return imagePath;
}

/**
 * Get image dimensions from a file
 */
export async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number } | null> {
  try {
    // Try using file command to get dimensions
    const proc = Bun.spawn(["file", imagePath], {
      stdout: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const match = output.match(/(\d+)\s*x\s*(\d+)/);

    if (match) {
      return {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      };
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Get file size in human-readable format
 */
export async function getFileSize(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const bytes = file.size;

  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Generate a timestamped filename
 */
export function generateFilename(prefix: string = "fal"): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `${prefix}-${timestamp}.png`;
}

/**
 * Open an image in the default viewer (macOS)
 */
export async function openImage(imagePath: string): Promise<void> {
  if (process.platform === "darwin") {
    Bun.spawn(["open", imagePath], { stdout: "ignore", stderr: "ignore" });
  } else if (process.platform === "linux") {
    Bun.spawn(["xdg-open", imagePath], { stdout: "ignore", stderr: "ignore" });
  }
}
