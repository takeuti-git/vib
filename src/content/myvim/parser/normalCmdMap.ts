import { InsertCommand } from "../insert";
import { MotionName, MotionType } from "../motion";
import { NormalCmdType, type NormalCmdContext } from "../normal";
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

export function isNoArgCmd(key: string): key is keyof typeof NO_ARG_CMD_MAP {
    return key in NO_ARG_CMD_MAP;
}

export const NO_ARG_CMD_MAP: Record<NoArgsCommands, (count: Count) => NormalCmdContext> = {
    // GO_INSERT
    "i": (count) => ({
        type: NormalCmdType.GO_INSERT,
        count,
        command: InsertCommand.INSERT,
    }),
    "a": (count) => ({
        type: NormalCmdType.GO_INSERT,
        count,
        command: InsertCommand.APPEND,
    }),
    "I": (count) => ({
        type: NormalCmdType.GO_INSERT,
        count,
        command: InsertCommand.INSERT_FIRST,
    }),
    "A": (count) => ({
        type: NormalCmdType.GO_INSERT,
        count,
        command: InsertCommand.APPEND_LAST,
    }),
    "o": (count) => ({
        type: NormalCmdType.GO_INSERT,
        count,
        command: InsertCommand.NEXTLINE,
    }),
    "O": (count) => ({
        type: NormalCmdType.GO_INSERT,
        count,
        command: InsertCommand.CURRENTLINE,
    }),

    // GO_VISUAL
    "v": (count) => ({
        type: NormalCmdType.GO_VISUAL,
        count,
        linewise: false,
    }),
    "V": (count) => ({
        type: NormalCmdType.GO_VISUAL,
        count,
        linewise: true,
    }),

    // JOIN
    "J": (count) => ({
        type: NormalCmdType.JOIN,
        count,
    }),

    // PUT
    "p": (count) => ({
        type: NormalCmdType.PUT,
        count,
        position: "after",
    }),
    "P": (count) => ({
        type: NormalCmdType.PUT,
        count,
        position: "before",
    }),

    // REPLACE
    "R": (count) => ({
        type: NormalCmdType.GO_REPLACE,
        count,
    }),

    // UNDO / REDO
    "u": (count) => ({
        type: NormalCmdType.UNDO,
        count,
    }),
    "<C-r>": (count) => ({
        type: NormalCmdType.REDO,
        count,
    }),

    // SCROLL
    "<C-u>": (count) => ({
        type: NormalCmdType.SCROLL,
        count,
        kind: ScrollCommand.UP_HALF,
    }),
    "<C-d>": (count) => ({
        type: NormalCmdType.SCROLL,
        count,
        kind: ScrollCommand.DOWN_HALF,
    }),
    "<C-b>": (count) => ({
        type: NormalCmdType.SCROLL,
        count,
        kind: ScrollCommand.UP_FULL,
    }),
    "<C-f>": (count) => ({
        type: NormalCmdType.SCROLL,
        count,
        kind: ScrollCommand.DOWN_FULL,
    }),

    // SUGAR
    "s": (count) => ({
        type: NormalCmdType.OPERATOR,
        count,
        innerCount: null,
        operator: OperatorName.CHANGE,
        motion: { type: MotionType.CHAR, name: MotionName.right },
    }),
    "S": (count) => ({
        type: NormalCmdType.OPERATOR,
        count,
        innerCount: null,
        operator: OperatorName.CHANGE,
        motion: { type: MotionType.LINEWISE },
    }),
    "x": (count) => ({
        type: NormalCmdType.OPERATOR,
        operator: OperatorName.DELETE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.right },
    }),
    "X": (count) => ({
        type: NormalCmdType.OPERATOR,
        operator: OperatorName.DELETE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.left },
    }),
    "D": (count) => ({
        type: NormalCmdType.OPERATOR,
        operator: OperatorName.DELETE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.last },
    }),
    "C": (count) => ({
        type: NormalCmdType.OPERATOR,
        operator: OperatorName.CHANGE,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.last },
    }),
    "Y": (count) => ({
        type: NormalCmdType.OPERATOR,
        operator: OperatorName.YANK,
        count,
        innerCount: null,
        motion: { type: MotionType.CHAR, name: MotionName.last },
    }),

    // CASE_SWITCH
    "~": (count) => ({
        type: NormalCmdType.SWITCH_CASE,
        count,
    }),

    // REPEAT_OPERATOR
    ".": (count) => ({
        type: NormalCmdType.REPEAT_OPE,
        count,
    }),

    // REPEAT_MOTION
    ";": (count) => ({
        type: NormalCmdType.REPEAT_MOT,
        count,
        reverse: false,
    }),
    ",": (count) => ({
        type: NormalCmdType.REPEAT_MOT,
        count,
        reverse: true,
    }),
};

type WithArgCmd = cmd.ReplaceCommand;
type WithArgCmdFunc = (count: Count, arg: string) => Readonly<NormalCmdContext>;
export function isWithArgCmd(key: string): key is WithArgCmd {
    return key in WITH_ARG_CMD_MAP;
}

export const WITH_ARG_CMD_MAP: Record<WithArgCmd, WithArgCmdFunc> = {
    "r": (count, arg) => ({ type: NormalCmdType.REPLACE, count, arg }),
};
