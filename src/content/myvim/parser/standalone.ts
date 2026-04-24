import type { Standalone } from "./command";
import { CommandType, type Count } from "./commandType";
import { ParseStatus, type CommandParseResult } from "./parseStatus";

type StandAloneHandler = (count: Count) => CommandParseResult;
export const STANDALONE_MAP: Record<Standalone, StandAloneHandler> = {
    J: (count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.JOIN, count },
    }),
    p: (count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.PUT, count, position: "after" },
    }),
    P: (count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.PUT, count, position: "before" },
    }),
    R: (count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.REPLACE, count, mode: { kind: "continuous" } },
    }),
    u: (count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.UNDO, count },
    }),
    "<C-r>": (count) => ({
        status: ParseStatus.OK,
        value: { type: CommandType.REDO, count },
    }),
};
