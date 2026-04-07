import type { ScrollCommand } from "./command";

export type ScrollKind = "up-half" | "down-half";

export const SCROLL_COMMAND_MAP: Record<ScrollCommand, ScrollKind> = {
    "<C-u>": "up-half",
    "<C-d>": "down-half",
};
