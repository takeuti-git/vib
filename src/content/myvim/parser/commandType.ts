import type { InsertCommand, Operator } from "./command";
import type { MotionContext } from "./motionType";
import type { ScrollKind } from "./scroll";

// prettier-ignore
export const CommandType = {
    OPERATOR:   "operator",
    INSERT:     "insert",
    MOTION:     "motion",
    PUT:        "put",
    REPLACE:    "replace",
    REPEAT_OPE: "repeat_ope",
    REPEAT_MOT: "repeat_mot",
    JOIN:       "join",
    UNDO:       "undo",
    REDO:       "redo",
    SCROLL:     "scroll",
    VISUAL:     "visual",
} as const;

type CommandType = (typeof CommandType)[keyof typeof CommandType];

// prettier-ignore
export type CommandContext = { count: Count } & (
    | { type: typeof CommandType.OPERATOR; operator: Operator; innerCount: Count; motion: MotionContext; }
    | { type: typeof CommandType.INSERT; command: InsertCommand }
    | { type: typeof CommandType.MOTION; motion: MotionContext }
    | { type: typeof CommandType.PUT; position: PutPosition }
    | { type: typeof CommandType.REPLACE; mode: ReplaceMode }
    | { type: typeof CommandType.REPEAT_OPE; }
    | { type: typeof CommandType.REPEAT_MOT; reverse: boolean }
    | { type: typeof CommandType.JOIN; }
    | { type: typeof CommandType.UNDO; }
    | { type: typeof CommandType.REDO; }
    | { type: typeof CommandType.SCROLL; kind: ScrollKind }
    | { type: typeof CommandType.VISUAL; }
);

export type Count = number | null;

type PutPosition = "before" | "after";

type ReplaceMode = { kind: "single"; char: string } | { kind: "continuous" };
