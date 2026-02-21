export function isFunctionKey(key: string): boolean {
    return /^F\d+/.test(key);
}

const IGNORE_KEYS = [
    "Escape", "Delete", "Insert",
    "Enter", "Control", "Shift", "Alt", "Meta",
    "Alphanumeric", "Tab", "Backspace", "Convert", "NonConvert",
    "Hiragana", "Zenkaku",
    "Home", "End", "PageUp", "PageDown", "Clear",
    "NumLock", "ContextMenu",
    "Process",
];

export function isIgnoreKey(key: string): boolean {
    return IGNORE_KEYS.includes(key);
}

export const MOVE_KEYS = {
    LEFT: "LEFT",
    RIGHT: "RIGHT",
    UP: "UP",
    DOWN: "DOWN",
} as const;

export type MoveKey = keyof typeof MOVE_KEYS;
