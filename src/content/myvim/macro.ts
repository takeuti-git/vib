const macroChars = [
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j",
    "k", "l", "m", "n", "o", "p", "q", "r", "s", "t",
    "u", "v", "w", "x", "y", "z"
] as const;

export type MacroChar = (typeof macroChars)[number];
export type MacroTable = Record<MacroChar, string[]>;

export function isValidMacroChar(ch: string): ch is MacroChar {
    return macroChars.some(v => v === ch);
}

export function createMacroTable(): MacroTable {
    return Object.fromEntries(
        macroChars.map(k => [k, [] as string[]])
    ) as MacroTable;
}
