import type { Count } from "./count";
import type { Operator } from "./command";
import type { MotionContext } from "./motionType";
import type { InsertCommand } from "../insert";
import type { ScrollCommand } from "../scroll";

// prettier-ignore
export const CommandType = {
    OPERATOR:    "operator",
    GO_INSERT:   "insert",
    MOTION:      "motion",
    PUT:         "put",
    REPLACE:     "replace", // 引数を伴う置き換え処理
    GO_REPLACE:  "go_replace", // モードの移行
    GO_VISUAL:   "go_visual",
    REPEAT_OPE:  "repeat_ope",
    REPEAT_MOT:  "repeat_mot",
    JOIN:        "join",
    UNDO:        "undo",
    REDO:        "redo",
    SCROLL:      "scroll",
    SWITCH_CASE: "switch_case",
    TO_LOWER:    "to_lower",
    TO_UPPER:    "to_upper",
} as const;

type CommandType = (typeof CommandType)[keyof typeof CommandType];

// prettier-ignore
export type CommandContext = { count: Count } & (
    | { type: typeof CommandType.GO_INSERT; command: InsertCommand; }
    | { type: typeof CommandType.GO_REPLACE; }
    | { type: typeof CommandType.GO_VISUAL; linewise: boolean; }
    | { type: typeof CommandType.OPERATOR; operator: Operator; innerCount: Count; motion: MotionContext; }
    | { type: typeof CommandType.MOTION; motion: MotionContext }
    | { type: typeof CommandType.PUT; position: PutPosition }
    | { type: typeof CommandType.REPLACE; arg: string; }
    | { type: typeof CommandType.REPEAT_OPE; }
    | { type: typeof CommandType.REPEAT_MOT; reverse: boolean }
    | { type: typeof CommandType.JOIN; }
    | { type: typeof CommandType.UNDO; }
    | { type: typeof CommandType.REDO; }
    | { type: typeof CommandType.SCROLL; kind: ScrollCommand }
    | { type: typeof CommandType.SWITCH_CASE; }
    | { type: typeof CommandType.TO_LOWER; innerCount: Count, motion: MotionContext; }
    | { type: typeof CommandType.TO_UPPER; innerCount: Count, motion: MotionContext; }
);

type PutPosition = "before" | "after";
