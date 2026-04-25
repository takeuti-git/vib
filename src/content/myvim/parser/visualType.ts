import type { MotionContext } from "./motionType";
import type { ScrollKind } from "./commandType";

const operators = ["d", "c", "y"] as const;
type Operator = (typeof operators)[number];
export function isOperator(ch: string): ch is Operator {
    return operators.some(v => v === ch);
}

const indentOperators = [">", "<"] as const;
type IndentOperator = (typeof indentOperators)[number];
export function isIndentOperator(ch: string): ch is IndentOperator {
    return indentOperators.some(v => v === ch);
}

const sideSwitchers = ["o", "O"] as const;
type SideSwitcher = (typeof sideSwitchers)[number];
export function isSideSwitcher(ch: string): ch is SideSwitcher {
    return sideSwitchers.some(v => v === ch);
}

const caseSwitchers = ["u", "U", "~"] as const;
type CaseSwitcher = (typeof caseSwitchers)[number];
export function isCaseSwitcher(ch: string): ch is CaseSwitcher {
    return caseSwitchers.some(v => v === ch);
}

const insertCommands = ["I", "A"] as const;
type VIS_InsertCommand = (typeof insertCommands)[number];
export function isInsertCommand(ch: string): ch is VIS_InsertCommand {
    return insertCommands.some(v => v === ch);
}

const sugars = ["s", "x", "X", "D", "C", "Y", "R", "S"] as const;
type VIS_Sugar = (typeof sugars)[number];
export function isSugar(ch: string): ch is VIS_Sugar {
    return sugars.some(v => v === ch);
}

const joinCommands = ["J"] as const;
type JoinCommand = (typeof joinCommands)[number];
export function isJoinCommand(ch: string): ch is JoinCommand {
    return joinCommands.some(v => v === ch);
}

const putCommands = ["p", "P"] as const;
type PutCommand = (typeof putCommands)[number];
export function isPutCommand(ch: string): ch is PutCommand {
    return putCommands.some(v => v === ch);
}

const replaceCommmands = ["r"] as const;
type ReplaceCommand = (typeof replaceCommmands)[number];
export function isReplaceCommand(ch: string): ch is ReplaceCommand {
    return replaceCommmands.some(v => v === ch);
}

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

export const OPERATOR_TO_CTX: Record<Operator, Readonly<VisualCmdContext>> = {
    "d": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: false }),
    "c": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: false }),
    "y": noCount({ type: VisualCmdType.OPERATOR, operator: "y", linewise: false }),
};

export const INDENT_OPERATOR_TO_CTX: Record<IndentOperator, (count: Count) => Readonly<VisualCmdContext>> = {
    "<": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: "<", linewise: false }),
    ">": (count) => ({ type: VisualCmdType.OPERATOR, count, operator: ">", linewise: false }),
};

export const SUGAR_TO_CTX: Record<VIS_Sugar, Readonly<VisualCmdContext>> = {
    "x": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: false }),
    "s": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: false }),
    "X": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: true }),
    "D": noCount({ type: VisualCmdType.OPERATOR, operator: "d", linewise: true }),
    "C": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: true }),
    "R": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: true }),
    "S": noCount({ type: VisualCmdType.OPERATOR, operator: "c", linewise: true }),
    "Y": noCount({ type: VisualCmdType.OPERATOR, operator: "y", linewise: true }),
};

// prettier-ignore
export const NO_ARG_CMD_MAP: Record<SideSwitcher | CaseSwitcher | JoinCommand, VisualCmdContext> = {
    "o": noCount({ type: VisualCmdType.SWITCH_SIDE }),
    "O": noCount({ type: VisualCmdType.SWITCH_SIDE }),
    "u": noCount({ type: VisualCmdType.TO_LOWER }),
    "U": noCount({ type: VisualCmdType.TO_UPPER }),
    "~": noCount({ type: VisualCmdType.REVERSE_CASE }),
    "J": noCount({ type: VisualCmdType.JOIN }),
};

export const PUT_CMD_MAP: Record<PutCommand, (count: Count) => VisualCmdContext> = {
    p: (count) => ({ type: VisualCmdType.PUT, count, writeRegister: true }),
    P: (count) => ({ type: VisualCmdType.PUT, count, writeRegister: false }),
};

export const REPLACE_CMD_MAP: Record<ReplaceCommand, (count: Count, arg: string) => VisualCmdContext> = {
    r: (count, arg) => ({ type: VisualCmdType.REPLACE, count, arg }),
};

export type VisalCmdType = (typeof VisualCmdType)[keyof typeof VisualCmdType];

export type VisualCmdContext = { count: Count } & (
    | { type: typeof VisualCmdType.OPERATOR; operator: Operator | IndentOperator; linewise: boolean; }
    | { type: typeof VisualCmdType.INSERT; command: VIS_InsertCommand; }
    | { type: typeof VisualCmdType.MOTION; motion: MotionContext; }
    | { type: typeof VisualCmdType.PUT; writeRegister: boolean; } /* 実行後に選択範囲をレジスタに書きこむか */
    | { type: typeof VisualCmdType.REPLACE; arg: string; }
    | { type: typeof VisualCmdType.REPEAT_MOT; reverse: boolean; }
    | { type: typeof VisualCmdType.JOIN; }
    | { type: typeof VisualCmdType.TO_LOWER; }
    | { type: typeof VisualCmdType.TO_UPPER; }
    | { type: typeof VisualCmdType.REVERSE_CASE; }
    | { type: typeof VisualCmdType.SWITCH_SIDE; }
    | { type: typeof VisualCmdType.SCROLL; kind: ScrollKind; }
);

type Count = number | null;
