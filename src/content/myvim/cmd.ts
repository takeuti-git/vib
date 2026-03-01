export const NORMAL_CMDS = [
    ".",
    "i", "a",
    "I", "A",
    "h", "j", "k", "l",
    "0", "^", "_", "$",
    "f", "F", "t", "T",
    // "yy",
    // "p", "P",
    // "dd", "x", "X",
    "d",
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
];

const REPEATABLE_CMDS_STARTSWIDTH = [
    "d",
];

export function isRepeatableCmd(cmd: string): boolean {
    return (REPEATABLE_CMDS as readonly string[]).includes(cmd) ||
        REPEATABLE_CMDS_STARTSWIDTH.some(c => cmd.startsWith(c));
}

const INSERTION_CMDS = [
    "a", "A", "i", "I",
    "o", "O",
];

export function isInsertionCmd(cmd: string): boolean {
    return INSERTION_CMDS.includes(cmd);
}
