import type { InsertCommand, Operator } from "./command";
import type { MotionContext } from "./motionType";

export const CommandType = {
    OPERATOR: "operator",
    INSERT: "insert",
    MOTION: "motion",
    PUT: "put",
    REPLACE: "replace",
    REPEAT_OPE: "repeat_ope",
    REPEAT_MOT: "repeat_mot",
    JOIN: "join",
    UNDO: "undo",
    REDO: "redo",
} as const;

type CommandType = (typeof CommandType)[keyof typeof CommandType];

export type CommandContext =
    | {
          type: typeof CommandType.OPERATOR;
          count: Count;
          operator: Operator;
          innerCount: Count;
          motion: MotionContext;
      }
    | { type: typeof CommandType.INSERT; count: Count; command: InsertCommand }
    | { type: typeof CommandType.MOTION; count: Count; motion: MotionContext }
    | { type: typeof CommandType.PUT; count: Count; position: PutPosition }
    | { type: typeof CommandType.REPLACE; count: Count; mode: ReplaceMode }
    | { type: typeof CommandType.REPEAT_OPE; count: Count }
    | { type: typeof CommandType.REPEAT_MOT; count: Count; reverse: boolean }
    | { type: typeof CommandType.JOIN; count: Count }
    | { type: typeof CommandType.UNDO; count: Count }
    | { type: typeof CommandType.REDO; count: Count };

export type Count = number | null;

type PutPosition = "before" | "after";

type ReplaceMode = { kind: "single"; char: string } | { kind: "continuous" };
