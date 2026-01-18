import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { generate, upscale, removeBackground } from "../../api/fal";
import { MODELS, estimateCost } from "../../api/models";
import {
  downloadImage,
  generateFilename,
  openImage,
  getImageDimensions,
  getFileSize,
  imageToDataUrl,
  resizeImage,
} from "../../utils/image";
import {
  addGeneration,
  generateId,
  getLastGeneration,
  type FalkyConfig,
  type Generation,
} from "../../utils/config";
import { resolve } from "path";

type Mode = "edit" | "variations" | "upscale" | "rmbg";
type Step = "loading" | "prompt" | "scale" | "confirm" | "processing" | "done";

interface EditScreenProps {
  config: FalkyConfig;
  mode: Mode;
  onBack: () => void;
  onComplete: () => void;
  onError: (err: Error) => void;
}

export function EditScreen({ config, mode, onBack, onComplete, onError }: EditScreenProps) {
  const [step, setStep] = useState<Step>("loading");
  const [lastGen, setLastGen] = useState<Generation | null>(null);
  const [prompt, setPrompt] = useState("");
  const [scale, setScale] = useState(2);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ path: string; dims: string; size: string } | null>(null);

  useEffect(() => {
    loadLast();
  }, []);

  const loadLast = async () => {
    const last = await getLastGeneration();
    if (!last) {
      onError(new Error("No previous generation found"));
      onBack();
      return;
    }
    setLastGen(last);

    // Set initial step based on mode
    if (mode === "edit") {
      setStep("prompt");
    } else if (mode === "variations") {
      setPrompt(last.prompt);
      setStep("confirm");
    } else if (mode === "upscale") {
      setStep("scale");
    } else if (mode === "rmbg") {
      setStep("confirm");
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      if (step === "processing") return;
      if (step === "done") {
        onComplete();
      } else {
        onBack();
      }
      return;
    }

    if (step === "scale") {
      if (key.upArrow && scale < 8) {
        setScale(scale + 1);
      } else if (key.downArrow && scale > 1) {
        setScale(scale - 1);
      } else if (key.return) {
        setStep("confirm");
      }
    } else if (step === "confirm") {
      if (key.return || input === "y") {
        runProcess();
      } else if (input === "n") {
        onBack();
      }
    } else if (step === "done") {
      if (key.return) {
        onComplete();
      }
    }
  });

  const handlePromptSubmit = (value: string) => {
    if (value.trim()) {
      setPrompt(value.trim());
      setStep("confirm");
    }
  };

  const runProcess = async () => {
    if (!lastGen) return;

    setStep("processing");

    try {
      let outputPath: string;
      let cost = 0;
      let promptLabel = "";

      if (mode === "edit") {
        setStatus("Preparing image...");
        const resized = await resizeImage(lastGen.output, 1024);
        const imageData = await imageToDataUrl(resized);

        setStatus("Generating edit...");
        const result = await generate({
          prompt,
          model: "gpt", // GPT supports editing
          editImage: imageData,
        });

        outputPath = generateFilename("edit");
        await downloadImage(result.images[0].url, outputPath);
        cost = estimateCost("gpt");
        promptLabel = prompt;
      } else if (mode === "variations") {
        setStatus("Generating variations...");
        const result = await generate({
          prompt: lastGen.prompt,
          model: lastGen.model,
          aspect: lastGen.aspect,
          resolution: lastGen.resolution,
          numImages: 1,
        });

        outputPath = generateFilename("var");
        await downloadImage(result.images[0].url, outputPath);
        cost = estimateCost(lastGen.model, lastGen.resolution);
        promptLabel = lastGen.prompt;
      } else if (mode === "upscale") {
        setStatus("Uploading image...");
        const imageData = await imageToDataUrl(lastGen.output);

        setStatus("Upscaling...");
        const result = await upscale({
          imageUrl: imageData,
          model: config.upscaler,
          scaleFactor: scale,
        });

        outputPath = lastGen.output.replace(".png", `-up${scale}x.png`);
        await downloadImage(result.images[0].url, outputPath);
        cost = 0.02;
        promptLabel = `[upscale ${scale}x] ${lastGen.prompt}`;
      } else {
        // rmbg
        setStatus("Uploading image...");
        const imageData = await imageToDataUrl(lastGen.output);

        setStatus("Removing background...");
        const result = await removeBackground({
          imageUrl: imageData,
          model: config.backgroundRemover,
        });

        outputPath = lastGen.output.replace(".png", "-nobg.png");
        await downloadImage(result.images[0].url, outputPath);
        cost = 0.02;
        promptLabel = `[rmbg] ${lastGen.prompt}`;
      }

      setStatus("Downloading...");

      const dims = await getImageDimensions(outputPath);
      const size = await getFileSize(outputPath);

      await addGeneration({
        id: generateId(),
        prompt: promptLabel,
        model: mode === "upscale" ? config.upscaler : mode === "rmbg" ? config.backgroundRemover : lastGen.model,
        aspect: lastGen.aspect,
        resolution: lastGen.resolution,
        output: resolve(outputPath),
        cost,
        timestamp: new Date().toISOString(),
        editedFrom: lastGen.output,
      });

      setResult({
        path: outputPath,
        dims: dims ? `${dims.width}x${dims.height}` : "?",
        size,
      });

      if (config.openAfterGenerate) {
        await openImage(outputPath);
      }

      setStep("done");
    } catch (err) {
      onError(err as Error);
      onBack();
    }
  };

  const getModeTitle = () => {
    switch (mode) {
      case "edit":
        return "Edit Image";
      case "variations":
        return "Generate Variations";
      case "upscale":
        return "Upscale Image";
      case "rmbg":
        return "Remove Background";
    }
  };

  if (step === "loading" || !lastGen) {
    return (
      <Box>
        <Text>Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{getModeTitle()}</Text>
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>Source: {lastGen.output.split("/").pop()}</Text>
      </Box>

      {/* Prompt input for edit mode */}
      {step === "prompt" && (
        <Box flexDirection="column">
          <Text>Describe the edit:</Text>
          <Box marginTop={1}>
            <Text color="cyan">▸ </Text>
            <TextInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handlePromptSubmit}
              placeholder="Change the background to a beach..."
            />
          </Box>
        </Box>
      )}

      {/* Scale selection for upscale */}
      {step === "scale" && (
        <Box flexDirection="column">
          <Text>Select upscale factor:</Text>
          <Box marginTop={1}>
            <Text color="cyan" bold>▸ {scale}x</Text>
            <Text dimColor> (↑↓ to adjust, Enter to confirm)</Text>
          </Box>
        </Box>
      )}

      {/* Confirmation */}
      {step === "confirm" && (
        <Box flexDirection="column">
          <Text bold>Ready to process:</Text>
          <Box marginTop={1} flexDirection="column" marginLeft={2}>
            {mode === "edit" && (
              <Text>Edit: <Text color="cyan">{prompt.slice(0, 40)}{prompt.length > 40 ? "..." : ""}</Text></Text>
            )}
            {mode === "variations" && (
              <Text>Prompt: <Text color="cyan">{lastGen.prompt.slice(0, 40)}...</Text></Text>
            )}
            {mode === "upscale" && (
              <>
                <Text>Scale: <Text color="cyan">{scale}x</Text></Text>
                <Text>Model: <Text color="green">{MODELS[config.upscaler]?.name}</Text></Text>
              </>
            )}
            {mode === "rmbg" && (
              <Text>Model: <Text color="green">{MODELS[config.backgroundRemover]?.name}</Text></Text>
            )}
          </Box>
          <Box marginTop={1}>
            <Text>Proceed? </Text>
            <Text color="green" bold>[Y]es</Text>
            <Text> / </Text>
            <Text color="red">[N]o</Text>
          </Box>
        </Box>
      )}

      {/* Processing */}
      {step === "processing" && (
        <Box>
          <Text color="yellow">⠋ {status}</Text>
        </Box>
      )}

      {/* Done */}
      {step === "done" && result && (
        <Box flexDirection="column">
          <Text color="green" bold>✓ Complete!</Text>
          <Box marginTop={1} flexDirection="column" marginLeft={2}>
            <Text>Saved: <Text color="cyan">{result.path}</Text></Text>
            <Text dimColor>({result.dims}, {result.size})</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to continue...</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
