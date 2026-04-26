import type { MotionContext } from "../motion";
import type { NormalCmdContext } from "../normal";
import type { VisualCmdContext } from "../visual";

type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];
export const ParseStatus = {
    OK: "ok",
    PENDING: "pending",
    UNKNOWN: "unknown",
} as const;

export type ParserContext = {
    read(): string | undefined;
    next(): string | undefined;
    eatDigits(): string;
};

type ParseResult<T> =
    | { status: typeof ParseStatus.OK; value: T }
    | { status: typeof ParseStatus.PENDING }
    | { status: typeof ParseStatus.UNKNOWN };

export type MotionParseResult = ParseResult<MotionContext>;
export type CommandParseResult = ParseResult<NormalCmdContext>;
export type VisualCmdParseResult = ParseResult<VisualCmdContext>;
