import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { TextField } from "./TextField";
import { Panel } from "./Panel";
import { COLOR, ICON } from "../theme";

interface FolderPromptProps {
  width: number;
  dirs: string[];
  active: string;
  onActivate: (dir: string) => void;
  onAdd: (raw: string) => void;
  onRemove: (dir: string) => void;
  onCancel: () => void;
}

export function FolderPrompt({
  width,
  dirs,
  active,
  onActivate,
  onAdd,
  onRemove,
  onCancel,
}: FolderPromptProps) {
  // Cursor spans the folders plus one trailing "add new" row (index dirs.length).
  const addRow = dirs.length;
  const [cursor, setCursor] = useState(() => {
    const i = dirs.indexOf(active);
    return i >= 0 ? i : 0;
  });
  const [adding, setAdding] = useState(false);

  // Keep the cursor in range whenever the folder list actually changes size
  // (e.g. the parent accepts a removal). If a removal is refused, dirs.length
  // is unchanged and the cursor is left alone.
  useEffect(() => {
    setCursor((c) => Math.min(c, dirs.length));
  }, [dirs.length]);

  useInput(
    (input, key) => {
      if (adding) {
        // TextField owns the keystrokes; esc backs out to the list.
        if (key.escape) setAdding(false);
        return;
      }
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.upArrow || input === "k") {
        setCursor((c) => (c > 0 ? c - 1 : c));
        return;
      }
      if (key.downArrow || input === "j") {
        setCursor((c) => (c < addRow ? c + 1 : c));
        return;
      }
      if (input === "a") {
        setCursor(addRow);
        setAdding(true);
        return;
      }
      if (key.return) {
        if (cursor === addRow) {
          setAdding(true);
        } else {
          const dir = dirs[cursor];
          if (dir) onActivate(dir);
        }
        return;
      }
      if ((key.delete || input === "d") && cursor < addRow) {
        const dir = dirs[cursor];
        if (dir) onRemove(dir);
        return;
      }
    },
  );

  return (
    <Box flexDirection="column" width={width}>
      <Panel title="download folder" width={width} focused>
        <Box flexDirection="column">
          {dirs.map((dir, i) => {
            const highlighted = i === cursor && !adding;
            const isActive = dir === active;
            return (
              <Box key={dir}>
                <Text color={highlighted ? COLOR.accent : COLOR.alt}>
                  {highlighted ? `${ICON.pointer} ` : "  "}
                </Text>
                <Text color={isActive ? COLOR.accent : COLOR.text} wrap="truncate-middle">
                  {dir}
                </Text>
                {isActive ? <Text color={COLOR.good}>{` ${ICON.done}`}</Text> : null}
              </Box>
            );
          })}
          <Box>
            <Text color={cursor === addRow && !adding ? COLOR.accent : COLOR.alt}>
              {cursor === addRow && !adding ? `${ICON.pointer} ` : "  "}
            </Text>
            {adding ? (
              <Box flexGrow={1} minWidth={0}>
                <TextField
                  placeholder="~/Downloads/torlink"
                  onSubmit={(raw) => {
                    setAdding(false);
                    onAdd(raw);
                  }}
                />
              </Box>
            ) : (
              <Text dimColor>+ add new folder…</Text>
            )}
          </Box>
        </Box>
      </Panel>
      <Box marginTop={1}>
        <Text color={COLOR.alt}>↵</Text>
        <Text dimColor> use</Text>
        <Text dimColor>{`   ${ICON.dot}   `}</Text>
        <Text color={COLOR.alt}>a</Text>
        <Text dimColor> add</Text>
        <Text dimColor>{`   ${ICON.dot}   `}</Text>
        <Text color={COLOR.alt}>d</Text>
        <Text dimColor> remove</Text>
        <Text dimColor>{`   ${ICON.dot}   `}</Text>
        <Text color={COLOR.alt}>esc</Text>
        <Text dimColor> cancel</Text>
      </Box>
    </Box>
  );
}
