import type { MotionContext } from "./motion";
import type { InsertCommand } from "./insert";
import type { ScrollCommand } from "./scroll";
import type { OperatorName } from "./operator";
import type { Count } from "./parser/count";

// prettier-ignore
export const NormalCmdType = {
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

type NormalCmdType = (typeof NormalCmdType)[keyof typeof NormalCmdType];

// prettier-ignore
export type NormalCmdContext = { count: Count } & (
    | { type: typeof NormalCmdType.GO_INSERT; command: InsertCommand; }
    | { type: typeof NormalCmdType.GO_REPLACE; }
    | { type: typeof NormalCmdType.GO_VISUAL; linewise: boolean; }
    | { type: typeof NormalCmdType.OPERATOR; operator: OperatorName; innerCount: Count; motion: MotionContext; }
    | { type: typeof NormalCmdType.MOTION; motion: MotionContext }
    | { type: typeof NormalCmdType.PUT; position: PutPosition }
    | { type: typeof NormalCmdType.REPLACE; arg: string; }
    | { type: typeof NormalCmdType.REPEAT_OPE; }
    | { type: typeof NormalCmdType.REPEAT_MOT; reverse: boolean }
    | { type: typeof NormalCmdType.JOIN; }
    | { type: typeof NormalCmdType.UNDO; }
    | { type: typeof NormalCmdType.REDO; }
    | { type: typeof NormalCmdType.SCROLL; kind: ScrollCommand }
    | { type: typeof NormalCmdType.SWITCH_CASE; }
    | { type: typeof NormalCmdType.TO_LOWER; innerCount: Count, motion: MotionContext; }
    | { type: typeof NormalCmdType.TO_UPPER; innerCount: Count, motion: MotionContext; }
);

type PutPosition = "before" | "after";
