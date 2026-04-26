import type { MotionContext } from "../motion";
import type { NormalCmdContext } from "../normal";
import type { VisualCmdContext } from "../visual";

type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];
export const ParseStatus = {
    OK:      "OK",
    PENDING: "PENDING",
    UNKNOWN: "UNKNOWN",
} as const;

export type ParserContext = {
    read(): string | undefined;
    next(): string | undefined;
    eatDigits(): string;
};

type ParseResult<T> = (
    | { status: typeof ParseStatus.OK; value: T; }
    | { status: typeof ParseStatus.PENDING; }
    | { status: typeof ParseStatus.UNKNOWN; }
);

export type MotionParseResult    = ParseResult<MotionContext>;
export type NormalCmdParseResult = ParseResult<NormalCmdContext>;
export type VisualCmdParseResult = ParseResult<VisualCmdContext>;

export const PENDING = { status: ParseStatus.PENDING } as const;
export const UNKNOWN = { status: ParseStatus.UNKNOWN } as const;
export const OK      = <T>(value: T) => ({ status: ParseStatus.OK, value } as const);
