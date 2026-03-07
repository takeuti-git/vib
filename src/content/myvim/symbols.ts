const SYMBOLS = ",-+*/=<>\\.({[)}]\"'`:;?!&%~^@|";
const SYMBOLS_SET: ReadonlySet<string> = new Set(SYMBOLS);

type StringToUnion<S extends string> =
    S extends `${infer F}${infer R}`
    ? F | StringToUnion<R>
    : never;

type Symbol = StringToUnion<typeof SYMBOLS>;

export function isSymbol(char: string): char is Symbol {
    return SYMBOLS_SET.has(char);
}

/** half/full width whitespace */
const WHITESPACES = " 　";

/** half/full width whitespace */
export type Whitespace = StringToUnion<typeof WHITESPACES>;

/** check if char is whitespace (half or full width) */
export function isWhitespace(char: string): char is Whitespace {
    return WHITESPACES.includes(char);
}
