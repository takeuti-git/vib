import type { MotionName } from "../motion";
import type { FindCommand, TextObjectType } from "./command";

export const MotionType = {
    CHAR: "char",
    LINEWISE: "linewise",
    FIND: "find",
    TEXTOBJ: "textobj",
    OFFSET_CHAR: "offset_char",
} as const;

type MotionType = (typeof MotionType)[keyof typeof MotionType];

export type MotionContext =
    | { type: typeof MotionType.CHAR; name: MotionName }
    | { type: typeof MotionType.LINEWISE; }
    | { type: typeof MotionType.FIND; name: FindCommand; arg: string }
    | { type: typeof MotionType.TEXTOBJ; name: TextObjectType; inner: boolean }
    | { type: typeof MotionType.OFFSET_CHAR; lineCount: number, charCount: number, destCol: number };
