import { formatBytesPerSec } from "../../util/format";
import { useStore } from "../store";

export type SettingsTarget = "folder" | "trackers" | "download" | "upload";

interface Entry {
  key: SettingsTarget;
  label: string;
  value: string;
}

function throttleValue(kbps: number): string {
  return kbps > 0 ? formatBytesPerSec(kbps * 1024) : "unlimited";
}

/**
 * Touch route to the settings that are otherwise keyboard-only prompts.
 * Each entry hands off to the same prompt component the keybinding opens.
 */
export function SettingsSheet({
  onCancel,
  onSelect,
}: {
  onCancel(): void;
  onSelect(target: SettingsTarget): void;
}) {
  const { config } = useStore();
  const entries: Entry[] = [
    { key: "folder", label: "Download folder", value: config.downloadDir },
    { key: "trackers", label: "Trackers", value: `${config.trackers.length} configured` },
    { key: "download", label: "Download limit", value: throttleValue(config.maxDownloadKbps) },
    { key: "upload", label: "Upload limit", value: throttleValue(config.maxUploadKbps) },
  ];

  return (
    <section aria-label="Settings" className="col prompt-modal settings-sheet">
      <div className="panel-title"><strong>Settings</strong></div>
      <div className="col settings-list">
        {entries.map((entry) => (
          <button
            className="settings-item"
            key={entry.key}
            onClick={() => onSelect(entry.key)}
            type="button"
          >
            <span className="settings-label">{entry.label}</span>
            <span className="dim trunc settings-value">{entry.value}</span>
          </button>
        ))}
      </div>
      <div className="settings-actions">
        <button className="ghost-button" onClick={onCancel} type="button">Close</button>
      </div>
    </section>
  );
}
