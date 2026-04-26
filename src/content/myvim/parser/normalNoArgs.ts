import { InsertCommand } from "../insert";
import { MotionName, MotionType } from "../motion";
import { CommandType, type NormalCmdContext } from "../normal";
import { OperatorName } from "../operator";
import { ScrollCommand } from "../scroll";
import * as cmd from "./normalCommand";
import type { Count } from "./count";

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

export const NO_ARG_CMD_MAP: Record<NoArgsCommands, (count: Count) => NormalCmdContext> = {
    // GO_INSERT
    "i": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: InsertCommand.INSERT,
    }),
    "a": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: InsertCommand.APPEND,
    }),
    "I": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: InsertCommand.INSERT_FIRST,
    }),
    "A": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: InsertCommand.APPEND_LAST,
    }),
    "o": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: InsertCommand.NEXTLINE,
    }),
    "O": (count) => ({
        type: CommandType.GO_INSERT,
        count,
        command: InsertCommand.CURRENTLINE,
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
        kind: ScrollCommand.UP_HALF,
    }),
    "<C-d>": (count) => ({
        type: CommandType.SCROLL,
        count,
        kind: ScrollCommand.DOWN_HALF,
    }),
    "<C-b>": (count) => ({
        type: CommandType.SCROLL,
        count,
        kind: ScrollCommand.UP_FULL,
    }),
    "<C-f>": (count) => ({
        type: CommandType.SCROLL,
        count,
        kind: ScrollCommand.DOWN_FULL,
    }),

    // SUGAR
    "s": (count) => ({
        type: CommandType.OPERATOR,
        count,
        innerCount: null,
        operator: OperatorName.CHANGE,
        motion: { type: MotionType.CHAR, name: MotionName.right },
    }),
    "S": (count) => ({
        type: CommandType.OPERATOR,
        count,
        innerCount: null,
        operator: OperatorName.CHANGE,
        motion: { type: MotionType.LINEWISE },
    }),
    "x": (count) => ({
        type: CommandType.OPERATOR,
        operator: OperatorName.DELETE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.right },
    }),
    "X": (count) => ({
        type: CommandType.OPERATOR,
        operator: OperatorName.DELETE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.left },
    }),
    "D": (count) => ({
        type: CommandType.OPERATOR,
        operator: OperatorName.DELETE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.last },
    }),
    "C": (count) => ({
        type: CommandType.OPERATOR,
        operator: OperatorName.CHANGE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.last },
    }),
    "Y": (count) => ({
        type: CommandType.OPERATOR,
        operator: OperatorName.YANK,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.last },
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
