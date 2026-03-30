import type { CommandContext } from "./commandType";
import type { MotionContext } from "./motionType";

type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];
export const ParseStatus = {
    OK: "ok",
    PENDING: "pending",
    UNKNOWN: "unknown",
} as const;

export type ParserContext = {
    read(): string;
    next(): string;
    eatDigits(): string;
};

export type MotionParseResult = ParseResult<MotionContext>;
export type CommandParseResult = ParseResult<CommandContext>;

type ParseResult<T> =
    | { status: typeof ParseStatus.OK; value: T }
    | { status: typeof ParseStatus.PENDING }
    | { status: typeof ParseStatus.UNKNOWN };
