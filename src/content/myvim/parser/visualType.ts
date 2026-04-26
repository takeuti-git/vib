import type { MotionContext } from "./motionType";
import type { Count } from "./count";
import type { ScrollCommand } from "../scroll";

type Operator = "d" | "c" | "y";

type IndentOperator = ">" | "<";

type SideSwitcher = "o" | "O";

type CaseSwitcher = "u" | "U" | "~"

type InsertCommand = "I" | "A";

type Sugar = "s" | "x" | "X" | "D" | "C" | "Y" | "R" | "S";

type JoinCommand = "J";

type PutCommand = "p" | "P";

type ReplaceCommand = "r";

type RepeatMotionCommand = ";" | ",";

// prettier-ignore
export const VisualCmdType = {
    OPERATOR:     "operator",
    INSERT:       "insert",
    MOTION:       "motion",
    PUT:          "put",
    REPLACE:      "replace",
    REPEAT_MOT:   "repeat_mot",
    JOIN:         "join",
    TO_LOWER:     "to_lower",
    TO_UPPER:     "to_upper",
    REVERSE_CASE: "reverse_case",
    SWITCH_SIDE:  "switch_side",
    SCROLL:       "scroll",
} as const;

const noCount = <T extends Omit<VisualCmdContext, "count">>(ctx: T) => 
    ({ ...ctx, count: null }) as T & { count: null };

export const INDENT_OPERATOR_TO_CTX: Record<IndentOperator, (count: Count) => Readonly<VisualCmdContext>> = {
    "<": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: "<", linewise: false }),
    ">": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: ">", linewise: false }),
};

type NoArgCmd = Operator | SideSwitcher | CaseSwitcher | JoinCommand | Sugar;
export const NO_ARG_CMD_MAP: Record<NoArgCmd, Readonly<VisualCmdContext>> = {
    // Operator
    "d": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: false }),
    "c": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: false }),
    "y": noCount({ type: VisualCmdType.OPERATOR, operator: "y", linewise: false }),

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
    "x": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: false }),
    "s": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: false }),
    "X": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: true }),
    "D": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: true }),
    "C": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: true }),
    "R": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: true }),
    "S": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: true }),
    "Y": noCount({ type: VisualCmdType.OPERATOR, operator: "y", linewise: true }),
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
    "<": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: "<", linewise: false }),
    ">": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: ">", linewise: false }),

    // Put
    "p": (count) => ({ type: VisualCmdType.PUT, count, writeRegister: true }),
    "P": (count) => ({ type: VisualCmdType.PUT, count, writeRegister: false }),

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

export type VisalCmdType = (typeof VisualCmdType)[keyof typeof VisualCmdType];

export type VisualCmdContext = { count: Count } & (
    | { type: typeof VisualCmdType.OPERATOR; operator: Operator | IndentOperator; linewise: boolean; }
    | { type: typeof VisualCmdType.INSERT; command: InsertCommand; }
    | { type: typeof VisualCmdType.MOTION; motion: MotionContext; }
    | { type: typeof VisualCmdType.PUT; writeRegister: boolean; } /* 実行後に選択範囲をレジスタに書きこむか */
    | { type: typeof VisualCmdType.REPLACE; arg: string; }
    | { type: typeof VisualCmdType.REPEAT_MOT; reverse: boolean; }
    | { type: typeof VisualCmdType.JOIN; }
    | { type: typeof VisualCmdType.TO_LOWER; }
    | { type: typeof VisualCmdType.TO_UPPER; }
    | { type: typeof VisualCmdType.REVERSE_CASE; }
    | { type: typeof VisualCmdType.SWITCH_SIDE; }
    | { type: typeof VisualCmdType.SCROLL; kind: ScrollCommand; }
);
