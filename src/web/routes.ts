import { CATEGORIES, type Section, type View } from "./store";

export const SECTIONS: Section[] = [...CATEGORIES.map((category) => category.key), "downloads", "seeding"];

export const OVERLAYS = ["settings", "folder", "trackers", "throttle-download", "throttle-upload", "help"] as const;
export type Overlay = (typeof OVERLAYS)[number];

export type PromptValue = "folder" | "trackers" | "download" | "upload";

export interface Route {
  view: View;
  section: Section;
  overlay: Overlay | null;
  query: string;
  redirect: boolean;
}

export function parseRoute(pathname: string, search: string): Route {
  const query = new URLSearchParams(search).get("q") ?? "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return { view: "splash", section: "all", overlay: null, query, redirect: false };

  const [sectionSegment, overlaySegment, ...rest] = segments;
  const section = SECTIONS.find((candidate) => candidate === sectionSegment);
  const overlay = OVERLAYS.find((candidate) => candidate === overlaySegment) ?? null;
  const valid = section !== undefined && rest.length === 0 && (overlaySegment === undefined || overlay !== null);
  if (!valid) return { view: "splash", section: "all", overlay: null, query: "", redirect: true };

  return { view: "browser", section: section!, overlay, query, redirect: false };
}

function querySuffix(query: string): string {
  return query ? `?q=${encodeURIComponent(query)}` : "";
}

export function sectionPath(section: Section, query: string): string {
  return `/${section}${querySuffix(query)}`;
}

export function overlayPath(section: Section, overlay: Overlay, query: string): string {
  return `/${section}/${overlay}${querySuffix(query)}`;
}

export function overlayToPrompt(overlay: Overlay | null): PromptValue | null {
  if (overlay === "throttle-download") return "download";
  if (overlay === "throttle-upload") return "upload";
  if (overlay === "folder" || overlay === "trackers") return overlay;
  return null;
}

export function promptToOverlay(prompt: PromptValue): Overlay {
  if (prompt === "download") return "throttle-download";
  if (prompt === "upload") return "throttle-upload";
  return prompt;
}
