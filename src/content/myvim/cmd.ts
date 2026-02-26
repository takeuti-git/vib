export const NORMAL_CMDS = [
    // ".",
    "i", "a",
    // "I", "A",
    "h", "j", "k", "l",
    "0",
    // "0", "^", "_", "$",
    // "yy",
    // "p", "P",
    // "dd", "x", "X",
    // "o", "O",
    // "w", "b",
    // "W", "B",
    // "gg", "G",
] as const;
// e, r, c/C, s/S

export type NormalCmd = (typeof NORMAL_CMDS)[number];

export function isValidCmd(input: string): boolean {
    return NORMAL_CMDS.some(c => c.startsWith(input));
}

const REPEATABLE_CMDS = [
    "p", "P",
    "dd", "x", "X",
] as const;

export type RepeatableCmd = (typeof REPEATABLE_CMDS)[number];

export function isRepeatableCmd(cmd: string): cmd is RepeatableCmd {
    return (REPEATABLE_CMDS as readonly string[]).includes(cmd);
}
