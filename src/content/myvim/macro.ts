const macroChars = ["a", "b", "c"] as const;

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
