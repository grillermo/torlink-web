import { Box, Text } from "ink";
import { useStore } from "../store";
import { COLOR, ICON, lerpHex, RULE } from "../theme";
import { cleanText } from "../../util/format";
import type { QueueItem } from "../../download/types";

const CARD_BORDER = lerpHex(COLOR.bad, RULE, 0.5);

export function ErrorDetail({ item }: { item: QueueItem }) {
  const { cols } = useStore();
  const width = Math.max(24, Math.min(cols - 4, 88));

  return (
    <Box
      flexDirection="column"
      alignSelf="flex-start"
      width={width}
      borderStyle="round"
      borderColor={CARD_BORDER}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={COLOR.bad}>
        {ICON.error} Download failed
      </Text>
      <Box marginTop={1}>
        <Text wrap="wrap">{cleanText(item.name)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={COLOR.bad} wrap="wrap">
          {item.error || "The download failed without a reported error."}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press esc to close, then f to retry</Text>
      </Box>
    </Box>
  );
}
