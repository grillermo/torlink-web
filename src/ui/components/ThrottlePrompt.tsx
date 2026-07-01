import { Box, Text, useInput } from "ink";
import { TextField } from "./TextField";
import { Panel } from "./Panel";
import { COLOR, ICON } from "../theme";

export type ThrottleDirection = "download" | "upload";

interface ThrottlePromptProps {
  width: number;
  direction: ThrottleDirection;
  value: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

const digitsOnly = (input: string): string => input.replace(/\D/g, "");

export function ThrottlePrompt({
  width,
  direction,
  value,
  onSubmit,
  onCancel,
}: ThrottlePromptProps) {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" width={width}>
      <Panel title={`${direction} throttle`} width={width} focused height={2}>
        <Box>
          <Text color={COLOR.accent}>{`${ICON.pointer} `}</Text>
          <Box flexGrow={1} minWidth={0}>
            <TextField
              defaultValue={value}
              placeholder="unlimited"
              filter={digitsOnly}
              onSubmit={onSubmit}
            />
          </Box>
          <Text dimColor> KB/s</Text>
        </Box>
      </Panel>
      <Box marginTop={1}>
        <Text color={COLOR.alt}>↵</Text>
        <Text dimColor> save</Text>
        <Text dimColor>{`     ${ICON.dot}     `}</Text>
        <Text color={COLOR.alt}>esc</Text>
        <Text dimColor> cancel</Text>
        <Text dimColor>{`     ${ICON.dot}     0 = unlimited`}</Text>
      </Box>
    </Box>
  );
}
