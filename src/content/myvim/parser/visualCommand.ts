import { OperatorName } from "../operator";
import { VisualCmdType, type VisualCmdContext } from "../visual";
import type { Count } from "./count";

type Operator = "d" | "c" | "y" | "<C-c>";

type IndentOperator = ">" | "<";

type SideSwitcher = "o" | "O";

type CaseSwitcher = "u" | "U" | "~"

type InsertCommand = "I" | "A";

type Sugar = "s" | "x" | "X" | "D" | "C" | "Y" | "R" | "S";

type JoinCommand = "J";

type PutCommand = "p" | "P" | "<C-v>";

type ReplaceCommand = "r";

type RepeatMotionCommand = ";" | ",";

const noCount = <T extends Omit<VisualCmdContext, "count">>(ctx: T) => 
    ({ ...ctx, count: null }) as T & { count: null };

type NoArgCmd = Operator | SideSwitcher | CaseSwitcher | JoinCommand | Sugar;
export const NO_ARG_CMD_MAP: Record<NoArgCmd, Readonly<VisualCmdContext>> = {
    // Operator
    "d":     noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.DELETE, linewise: false }),
    "c":     noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.CHANGE, linewise: false }),
    "y":     noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.YANK,   linewise: false }),
    "<C-c>": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.YANK,   linewise: false }),

    // SideSwitcher
    "o": noCount({ type: VisualCmdType.SWITCH_SIDE }),
    "O": noCount({ type: VisualCmdType.SWITCH_SIDE }),

    // CaseSwitcher
    "u": noCount({ type: VisualCmdType.TO_LOWER }),
    "U": noCount({ type: VisualCmdType.TO_UPPER }),
    "~": noCount({ type: VisualCmdType.REVERSE_CASE }),

    // Join
    "J": noCount({ type: VisualCmdType.JOIN }),

    // Sugar
    "x": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.DELETE, linewise: false }),
    "s": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.CHANGE, linewise: false }),
    "X": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.DELETE, linewise: true }),
    "D": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.DELETE, linewise: true }),
    "C": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.CHANGE, linewise: true }),
    "R": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.CHANGE, linewise: true }),
    "S": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.CHANGE, linewise: true }),
    "Y": noCount({ type: VisualCmdType.OPERATOR, operator: OperatorName.YANK,   linewise: true }),
};
export function isNoArgCmdKey(key: string): key is NoArgCmd {
    return key in NO_ARG_CMD_MAP;
}

type WithCountCmd = InsertCommand | IndentOperator | PutCommand | RepeatMotionCommand;
type WithCountCmdFunc = (count: Count) => Readonly<VisualCmdContext>;
export const WITH_COUNT_CMD_MAP: Record<WithCountCmd, WithCountCmdFunc> = {
    // Insert
    "I": (count) => ({ type: VisualCmdType.INSERT, count, command: "I" }),
    "A": (count) => ({ type: VisualCmdType.INSERT, count, command: "A" }),

    // Indent
    "<": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: OperatorName.DEC_INDENT, linewise: false }),
    ">": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: OperatorName.INC_INDENT, linewise: false }),

    // Put
    "p": (count) =>     ({ type: VisualCmdType.PUT, count, writeRegister: true }),
    "P": (count) =>     ({ type: VisualCmdType.PUT, count, writeRegister: false }),
    "<C-v>": (count) => ({ type: VisualCmdType.PUT, count, writeRegister: true }),

    // RepeatMotion
    ";": (count) => ({ type: VisualCmdType.REPEAT_MOT, count, reverse: false }),
    ",": (count) => ({ type: VisualCmdType.REPEAT_MOT, count, reverse: true }),
};
export function isWithCountCmdKey(key: string): key is WithCountCmd {
    return key in WITH_COUNT_CMD_MAP;
}

type WithArgCmd = ReplaceCommand;
type WithArgCmdFunc = (count: Count, arg: string) => Readonly<VisualCmdContext>;
export const WITH_ARG_CMD_MAP: Record<WithArgCmd, WithArgCmdFunc> = {
    "r": (count, arg) => ({ type: VisualCmdType.REPLACE, count, arg }),
};
export function isWithArgCmdKey(key: string): key is WithArgCmd {
    return key in WITH_ARG_CMD_MAP;
}
