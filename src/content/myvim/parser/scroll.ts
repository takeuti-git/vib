import type { ScrollCommand } from "./command";

export type ScrollKind = "up-half" | "down-half" | "up-full" | "down-full";

export const SCROLL_COMMAND_MAP: Record<ScrollCommand, ScrollKind> = {
    "<C-u>": "up-half",
    "<C-d>": "down-half",
    "<C-b>": "up-full",
    "<C-f>": "down-full",
};
