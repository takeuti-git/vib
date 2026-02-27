export const NORMAL_CMDS = [
    ".",
    "i", "a",
    "I", "A",
    "h", "j", "k", "l",
    "0", "^", "_", "$",
    // "yy",
    // "p", "P",
    // "dd", "x", "X",
    "o", "O",
    // "w", "b",
    // "W", "B",
    "gg", "G",
] as const;
// e, r, c/C, s/S

export type NormalCmd = (typeof NORMAL_CMDS)[number];

export function isValidCmd(input: string): boolean {
    return NORMAL_CMDS.some(c => c.startsWith(input));
}

const REPEATABLE_CMDS = [
    "a", "A", "i", "I",
    "o", "O",
] as const;

export type RepeatableCmd = (typeof REPEATABLE_CMDS)[number];

export function isRepeatableCmd(cmd: string): cmd is RepeatableCmd {
    return (REPEATABLE_CMDS as readonly string[]).includes(cmd);
}

const INSERTION_CMDS = [
    "a", "A", "i", "I",
    "o", "O",
];

export function isInsertionCmd(cmd: string): boolean {
    return INSERTION_CMDS.includes(cmd);
}
