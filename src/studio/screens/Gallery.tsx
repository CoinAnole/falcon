import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { History } from "../../utils/config";
import { MODELS } from "../../api/models";
import { openImage } from "../../utils/image";

interface GalleryScreenProps {
  history: History;
  onBack: () => void;
}

export function GalleryScreen({ history, onBack }: GalleryScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 8;

  const generations = history.generations;
  const totalPages = Math.ceil(generations.length / pageSize);
  const pageItems = generations.slice(page * pageSize, (page + 1) * pageSize);

  useInput(async (input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow) {
      if (selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      } else if (page > 0) {
        setPage(page - 1);
        setSelectedIndex(pageSize - 1);
      }
    }

    if (key.downArrow) {
      if (selectedIndex < pageItems.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      } else if (page < totalPages - 1) {
        setPage(page + 1);
        setSelectedIndex(0);
      }
    }

    if (key.leftArrow && page > 0) {
      setPage(page - 1);
      setSelectedIndex(0);
    }

    if (key.rightArrow && page < totalPages - 1) {
      setPage(page + 1);
      setSelectedIndex(0);
    }

    if (key.return && pageItems[selectedIndex]) {
      // Open the selected image
      await openImage(pageItems[selectedIndex].output);
    }
  });

  if (generations.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>Gallery</Text>
        <Box marginTop={1}>
          <Text dimColor>No generations yet. Create your first image!</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Gallery</Text>
        <Text dimColor> ({generations.length} images)</Text>
      </Box>

      {pageItems.map((gen, index) => {
        const isSelected = index === selectedIndex;
        const date = new Date(gen.timestamp);
        const timeStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return (
          <Box key={gen.id} marginLeft={1}>
            <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
              {isSelected ? "▸ " : "  "}
            </Text>
            <Box width={45}>
              <Text color={isSelected ? "cyan" : undefined}>
                {gen.prompt.slice(0, 35)}{gen.prompt.length > 35 ? "..." : ""}
              </Text>
            </Box>
            <Box width={18}>
              <Text dimColor>{MODELS[gen.model]?.name?.slice(0, 15) || gen.model}</Text>
            </Box>
            <Text dimColor>{timeStr}</Text>
          </Box>
        );
      })}

      {totalPages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page + 1}/{totalPages} (←→ to navigate)
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter: Open image | Esc: Back</Text>
      </Box>
    </Box>
  );
}
