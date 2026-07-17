import { cleanText } from "../../util/format";
import type { QueueItem } from "../../download/types";
import { ICON } from "../theme";
import { RowActions } from "./RowActions";

export function ErrorDetail({ item, onClose, onRetry }: {
  item: QueueItem;
  onClose(): void;
  onRetry(): void;
}) {
  return (
    <section className="col error-detail" role="dialog" aria-label="Download failed">
      <strong className="bad">{ICON.error} Download failed</strong>
      <p>{cleanText(item.name)}</p>
      <p className="bad">{item.error || "The download failed without a reported error."}</p>
      <p className="dim kb-only">Press esc to close, then f to retry</p>
      <RowActions actions={[
        { label: "retry", onPress: onRetry },
        { label: "close", onPress: onClose },
      ]} label="Error actions" />
    </section>
  );
}
