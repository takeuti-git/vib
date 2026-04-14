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

export function getInputFromEvent(event: KeyboardEvent): string {
    const key = event.key;
    if (event.ctrlKey) {
        return `<C-${key}>`;
    } else {
        return key;
    }
}

export function isValidKey(key: string): boolean {
    return key.length === 1 || key === "Enter";
}
