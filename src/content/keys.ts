export function isFunctionKey(key: string): boolean {
    return /^F\d+/.test(key);
}

export const MOVE_KEYS = {
    LEFT: "LEFT",
    RIGHT: "RIGHT",
    UP: "UP",
    DOWN: "DOWN",
} as const;

export type MoveKey = keyof typeof MOVE_KEYS;
