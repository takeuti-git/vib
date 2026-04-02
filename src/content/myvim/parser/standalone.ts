import type { Standalone } from "./command";
import { CommandType, type CommandContext, type Count } from "./commandType";
import { ParseStatus, type CommandParseResult, type ParserContext } from "./parseStatus";

type StandAloneHandler = (ctx: ParserContext, count: Count) => CommandParseResult;
export const STANDALONE_MAP: Record<Standalone, StandAloneHandler> = {
    J: (_, count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.JOIN, count },
    }),
    p: (_, count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.PUT, count, position: "after" },
    }),
    P: (_, count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.PUT, count, position: "before" },
    }),
    r: (ctx, count) => {
        const ch = ctx.next();
        if (!ch) return { status: ParseStatus.PENDING };
        const command: CommandContext = {
            type: CommandType.REPLACE,
            count,
            mode: { kind: "single", char: ch },
        };
        return { status: ParseStatus.OK, value: command };
    },
    R: (_, count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.REPLACE, count, mode: { kind: "continuous" } },
    }),
    u: (_, count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.UNDO, count },
    }),
    "<C-r>": (_, count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.REDO, count },
    }),
};
