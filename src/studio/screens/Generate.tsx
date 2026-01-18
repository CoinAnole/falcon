import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { generate } from "../../api/fal";
import {
  MODELS,
  GENERATION_MODELS,
  ASPECT_RATIOS,
  RESOLUTIONS,
  estimateCost,
  type AspectRatio,
  type Resolution,
} from "../../api/models";
import {
  downloadImage,
  generateFilename,
  openImage,
  getImageDimensions,
  getFileSize,
} from "../../utils/image";
import { addGeneration, generateId, type FalkyConfig } from "../../utils/config";
import { resolve } from "path";

type Step = "prompt" | "model" | "aspect" | "resolution" | "confirm" | "generating" | "done";

interface GenerateScreenProps {
  config: FalkyConfig;
  onBack: () => void;
  onComplete: () => void;
  onError: (err: Error) => void;
}

export function GenerateScreen({ config, onBack, onComplete, onError }: GenerateScreenProps) {
  const [step, setStep] = useState<Step>("prompt");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(config.defaultModel);
  const [aspect, setAspect] = useState<AspectRatio>(config.defaultAspect);
  const [resolution, setResolution] = useState<Resolution>(config.defaultResolution);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ path: string; dims: string; size: string } | null>(null);

  const modelConfig = MODELS[model];
  const cost = estimateCost(model, resolution);

  useInput((input, key) => {
    if (key.escape) {
      if (step === "generating") return;
      if (step === "prompt") {
        onBack();
      } else if (step === "done") {
        onComplete();
      } else {
        // Go back a step
        const steps: Step[] = ["prompt", "model", "aspect", "resolution", "confirm"];
        const currentIdx = steps.indexOf(step);
        if (currentIdx > 0) {
          setStep(steps[currentIdx - 1]);
          setSelectedIndex(0);
        }
      }
      return;
    }

    if (step === "model") {
      handleListNavigation(GENERATION_MODELS, (m) => {
        setModel(m);
        setStep(modelConfig?.supportsAspect ? "aspect" : "confirm");
      }, key, input);
    } else if (step === "aspect") {
      handleListNavigation(ASPECT_RATIOS, (a) => {
        setAspect(a as AspectRatio);
        setStep(modelConfig?.supportsResolution ? "resolution" : "confirm");
      }, key, input);
    } else if (step === "resolution") {
      handleListNavigation(RESOLUTIONS, (r) => {
        setResolution(r as Resolution);
        setStep("confirm");
      }, key, input);
    } else if (step === "confirm") {
      if (key.return || input === "y") {
        runGeneration();
      } else if (input === "n") {
        onBack();
      }
    } else if (step === "done") {
      if (key.return) {
        onComplete();
      }
    }
  });

  const handleListNavigation = <T extends string>(
    items: readonly T[],
    onSelect: (item: T) => void,
    key: { upArrow?: boolean; downArrow?: boolean; return?: boolean },
    input: string
  ) => {
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      onSelect(items[selectedIndex]);
      setSelectedIndex(0);
    }
  };

  const runGeneration = async () => {
    setStep("generating");
    setStatus("Generating...");

    try {
      const result = await generate({
        prompt,
        model,
        aspect,
        resolution,
        numImages: 1,
      });

      setStatus("Downloading...");
      const outputPath = generateFilename();
      await downloadImage(result.images[0].url, outputPath);

      const dims = await getImageDimensions(outputPath);
      const size = await getFileSize(outputPath);

      // Record generation
      await addGeneration({
        id: generateId(),
        prompt,
        model,
        aspect,
        resolution,
        output: resolve(outputPath),
        cost,
        timestamp: new Date().toISOString(),
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

  const handlePromptSubmit = (value: string) => {
    if (value.trim()) {
      setPrompt(value.trim());
      setStep("model");
    }
  };

  return (
    <Box flexDirection="column">
      {/* Prompt input */}
      {step === "prompt" && (
        <Box flexDirection="column">
          <Text bold>Enter your prompt:</Text>
          <Box marginTop={1}>
            <Text color="cyan">▸ </Text>
            <TextInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handlePromptSubmit}
              placeholder="A cat sitting on a windowsill..."
            />
          </Box>
        </Box>
      )}

      {/* Model selection */}
      {step === "model" && (
        <Box flexDirection="column">
          <Text bold>Select model:</Text>
          <Box marginTop={1} flexDirection="column">
            {GENERATION_MODELS.map((m, i) => (
              <Box key={m}>
                <Text color={i === selectedIndex ? "cyan" : undefined} bold={i === selectedIndex}>
                  {i === selectedIndex ? "▸ " : "  "}
                  {MODELS[m].name.padEnd(20)}
                </Text>
                <Text dimColor>{MODELS[m].pricing}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Aspect ratio selection */}
      {step === "aspect" && (
        <Box flexDirection="column">
          <Text bold>Select aspect ratio:</Text>
          <Box marginTop={1} flexDirection="row" flexWrap="wrap">
            {ASPECT_RATIOS.map((a, i) => (
              <Box key={a} width="20%" marginRight={1}>
                <Text color={i === selectedIndex ? "cyan" : undefined} bold={i === selectedIndex}>
                  {i === selectedIndex ? "▸ " : "  "}{a}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Resolution selection */}
      {step === "resolution" && (
        <Box flexDirection="column">
          <Text bold>Select resolution:</Text>
          <Box marginTop={1} flexDirection="column">
            {RESOLUTIONS.map((r, i) => (
              <Box key={r}>
                <Text color={i === selectedIndex ? "cyan" : undefined} bold={i === selectedIndex}>
                  {i === selectedIndex ? "▸ " : "  "}{r}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Confirmation */}
      {step === "confirm" && (
        <Box flexDirection="column">
          <Text bold>Ready to generate:</Text>
          <Box marginTop={1} flexDirection="column" marginLeft={2}>
            <Text>Prompt: <Text color="cyan">{prompt.slice(0, 50)}{prompt.length > 50 ? "..." : ""}</Text></Text>
            <Text>Model:  <Text color="green">{MODELS[model].name}</Text></Text>
            <Text>Aspect: {aspect}</Text>
            {modelConfig?.supportsResolution && <Text>Resolution: {resolution}</Text>}
            <Text>Est. cost: <Text color="yellow">${cost.toFixed(3)}</Text></Text>
          </Box>
          <Box marginTop={1}>
            <Text>Generate? </Text>
            <Text color="green" bold>[Y]es</Text>
            <Text> / </Text>
            <Text color="red">[N]o</Text>
          </Box>
        </Box>
      )}

      {/* Generating */}
      {step === "generating" && (
        <Box>
          <Text color="yellow">⠋ {status}</Text>
        </Box>
      )}

      {/* Done */}
      {step === "done" && result && (
        <Box flexDirection="column">
          <Text color="green" bold>✓ Generation complete!</Text>
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
