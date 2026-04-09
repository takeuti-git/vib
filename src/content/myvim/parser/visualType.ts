import type { Operator } from "./command";
import type { MotionContext } from "./motionType";
import type { ScrollKind } from "./scroll";

const sideSwitchers = ["o", "O"] as const;
type SideSwitcher = (typeof sideSwitchers)[number];
export function isSideSwitcher(ch: string): ch is SideSwitcher {
    return sideSwitchers.some(v => v === ch);
}

const caseSwitchers = ["u", "U"] as const;
type CaseSwitcher = (typeof caseSwitchers)[number];
export function isCaseSwitcher(ch: string): ch is CaseSwitcher {
    return caseSwitchers.some(v => v === ch);
}

const insertCommands = ["I", "A"] as const;
type VIS_InsertCommand = (typeof insertCommands)[number];
export function isInsertCommand(ch: string): ch is VIS_InsertCommand {
    return insertCommands.some(v => v === ch);
}

const sugars = ["s", "x", "X", "D", "C", "Y"] as const;
type VIS_Sugar = (typeof sugars)[number];
export function isSugar(ch: string): ch is VIS_Sugar {
    return sugars.some(v => v === ch);
}

const joinCommands = ["J"] as const;
type JoinCommand = (typeof joinCommands)[number];
export function isJoinCommand(ch: string): ch is JoinCommand {
    return joinCommands.some(v => v === ch);
}

// prettier-ignore
export const VisualCmdType = {
    OPERATOR:   "operator",
    INSERT:     "insert",
    MOTION:     "motion",
    PUT:        "put",
    REPLACE:    "replace",
    REPEAT_MOT: "repeat_mot",
    JOIN:       "join",
    TO_LOWER:   "to_lower",
    TO_UPPER:   "to_upper",
    SWITCH_SIDE: "switch_side",
    SCROLL:     "scroll",
} as const;


export const NO_ARG_CMD_MAP: Record<Operator | VIS_Sugar | SideSwitcher | CaseSwitcher | JoinCommand, VisualCmdContext> = {
    "d": { type: VisualCmdType.OPERATOR, operator: "d", linewise: false },
    "c": { type: VisualCmdType.OPERATOR, operator: "c", linewise: false },
    "y": { type: VisualCmdType.OPERATOR, operator: "y", linewise: false },
    "<": { type: VisualCmdType.OPERATOR, operator: "<", linewise: false },
    ">": { type: VisualCmdType.OPERATOR, operator: ">", linewise: false },

    "x": { type: VisualCmdType.OPERATOR, operator: "d", linewise: false },
    "s": { type: VisualCmdType.OPERATOR, operator: "c", linewise: false },
    "X": { type: VisualCmdType.OPERATOR, operator: "d", linewise: true },
    "D": { type: VisualCmdType.OPERATOR, operator: "d", linewise: true },
    "C": { type: VisualCmdType.OPERATOR, operator: "c", linewise: true },
    "Y": { type: VisualCmdType.OPERATOR, operator: "y", linewise: true },

    "o": { type: VisualCmdType.SWITCH_SIDE, },
    "O": { type: VisualCmdType.SWITCH_SIDE, },
    "u": { type: VisualCmdType.TO_LOWER, },
    "U": { type: VisualCmdType.TO_UPPER, },
    "J": { type: VisualCmdType.JOIN },
};

const visualStandalones = ["p", "P"] as const;
type VisualStandalone = (typeof visualStandalones)[number];

export const VISUAL_STANDALONE_MAP: Record<VisualStandalone, (count: number) => VisualCmdContext> = {
    // J: () => ({ type: VisualCmdType.JOIN }),
    p: (count) => ({ type: VisualCmdType.PUT, count }),
    P: (count) => ({ type: VisualCmdType.PUT, count }),
    // R: (_, count) => ({ type: VisualCmdType.REPLACE }),
};

export type VisalCmdType = (typeof VisualCmdType)[keyof typeof VisualCmdType];

// prettier-ignore
export type VisualCmdContext =
    | { type: typeof VisualCmdType.OPERATOR; operator: Operator; linewise: boolean; }
    | { type: typeof VisualCmdType.INSERT; count: Count; command: VIS_InsertCommand }
    | { type: typeof VisualCmdType.MOTION; count: Count; motion: MotionContext }
    | { type: typeof VisualCmdType.PUT; count: Count; }
    | { type: typeof VisualCmdType.REPLACE; char: string }
    | { type: typeof VisualCmdType.REPEAT_MOT; count: Count; reverse: boolean }
    | { type: typeof VisualCmdType.JOIN; }
    | { type: typeof VisualCmdType.TO_LOWER; }
    | { type: typeof VisualCmdType.TO_UPPER; }
    | { type: typeof VisualCmdType.SWITCH_SIDE; }
    | { type: typeof VisualCmdType.SCROLL; count: Count; kind: ScrollKind }

type Count = number | null;
