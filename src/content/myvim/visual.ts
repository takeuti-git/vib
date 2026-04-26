import type { MotionContext } from "./motion";
import type { GoInsertCommand } from "./parser/normalCommand";
import type { ScrollCommand } from "./scroll";
import type { Count } from "./parser/count";
import type { OperatorName } from "./operator";

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


export type VisalCmdType = (typeof VisualCmdType)[keyof typeof VisualCmdType];

export type VisualCmdContext = { count: Count } & (
    | { type: typeof VisualCmdType.OPERATOR; operator: OperatorName; linewise: boolean; }
    | { type: typeof VisualCmdType.INSERT; command: GoInsertCommand; }
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
