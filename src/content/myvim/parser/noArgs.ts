import * as cmd from "./command";
import { CommandType, type CommandContext } from "./commandType";
import type { Count } from "./count";
import { MotionType } from "./motionType";

type NoArgsCommands = (
    | cmd.GoInsertCommand
    | cmd.GoReplaceCommand
    | cmd.GoVisualCommand
    | cmd.SugarCommand
    | cmd.JoinCommand
    | cmd.PutCommand
    | cmd.UndoCommand
    | cmd.RedoCommand
    | cmd.ScrollCommand
    | cmd.SwitchCaseCommand
    | cmd.RepeatOperatorCommand
    | cmd.RepeatMotionCommand
);

export function isNoArgKey(key: string): key is keyof typeof NO_ARG_CMD_MAP {
    return key in NO_ARG_CMD_MAP;
}

export const NO_ARG_CMD_MAP: Record<NoArgsCommands, (count: Count) => CommandContext> = {
    // GO_INSERT
    "i": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: "i",
    }),
    "a": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: "a",
    }),
    "I": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: "I",
    }),
    "A": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: "A",
    }),
    "o": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: "o",
    }),
    "O": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: "O",
    }),

    // GO_VISUAL
    "v": (count) => ({
        type: CommandType.GO_VISUAL,
        count,
        linewise: false,
    }),
    "V": (count) => ({
        type: CommandType.GO_VISUAL,
        count,
        linewise: true,
    }),

    // JOIN
    "J": (count) => ({
        type: CommandType.JOIN,
        count,
    }),

    // PUT
    "p": (count) => ({
        type: CommandType.PUT,
        count,
        position: "after",
    }),
    "P": (count) => ({
        type: CommandType.PUT,
        count,
        position: "before",
    }),

    // REPLACE
    "R": (count) => ({
        type: CommandType.GO_REPLACE,
        count,
    }),

    // UNDO / REDO
    "u": (count) => ({
        type: CommandType.UNDO,
        count,
    }),
    "<C-r>": (count) => ({
        type: CommandType.REDO,
        count,
    }),

    // SCROLL
    "<C-u>": (count) => ({
        type: CommandType.SCROLL,
        count,
        kind: "up-half",
    }),
    "<C-d>": (count) => ({
        type: CommandType.SCROLL,
        count,
        kind: "down-half",
    }),
    "<C-b>": (count) => ({
        type: CommandType.SCROLL,
        count,
        kind: "up-full",
    }),
    "<C-f>": (count) => ({
        type: CommandType.SCROLL,
        count,
        kind: "down-full",
    }),

    // SUGAR
    "s": (count) => ({
        type: CommandType.OPERATOR,
        count,
        innerCount: null,
        operator: "c",
        motion: { type: MotionType.CHAR, name: "l" },
    }),
    "S": (count) => ({
        type: CommandType.OPERATOR,
        count,
        innerCount: null,
        operator: "c",
        motion: { type: MotionType.LINEWISE },
    }),
    "x": (count) => ({
        type: CommandType.OPERATOR,
        operator: "d",
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: "l" },
    }),
    "X": (count) => ({
        type: CommandType.OPERATOR,
        operator: "d",
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: "h" },
    }),
    "D": (count) => ({
        type: CommandType.OPERATOR,
        operator: "d",
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: "$" },
    }),
    "C": (count) => ({
        type: CommandType.OPERATOR,
        operator: "c",
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: "$" },
    }),
    "Y": (count) => ({
        type: CommandType.OPERATOR,
        operator: "y",
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: "$" },
    }),

    // CASE_SWITCH
    "~": (count) => ({
        type: CommandType.SWITCH_CASE,
        count,
    }),

    // REPEAT_OPERATOR
    ".": (count) => ({
        type: CommandType.REPEAT_OPE,
        count,
    }),

    // REPEAT_MOTION
    ";": (count) => ({
        type: CommandType.REPEAT_MOT,
        count,
        reverse: false,
    }),
    ",": (count) => ({
        type: CommandType.REPEAT_MOT,
        count,
        reverse: true,
    }),
};
