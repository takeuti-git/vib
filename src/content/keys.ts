const FUNCTION_KEY = new RegExp(/^F\d+/);
export function isFunctionKey(key: string): boolean {
    return FUNCTION_KEY.test(key);
}

export const MOVE_KEYS = {
    LEFT: "LEFT",
    RIGHT: "RIGHT",
    UP: "UP",
    DOWN: "DOWN",
} as const;

export type MoveKey = keyof typeof MOVE_KEYS;
