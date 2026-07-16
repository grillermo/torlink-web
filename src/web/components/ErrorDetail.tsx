import { cleanText } from "../../util/format";
import type { QueueItem } from "../../download/types";
import { ICON } from "../theme";

export function ErrorDetail({ item }: { item: QueueItem }) {
  return (
    <section className="col error-detail" role="dialog" aria-label="Download failed">
      <strong className="bad">{ICON.error} Download failed</strong>
      <p>{cleanText(item.name)}</p>
      <p className="bad">{item.error || "The download failed without a reported error."}</p>
      <p className="dim">Press esc to close, then f to retry</p>
    </section>
  );
}
