import type { FindCommand, Motion, TextObjectType } from "./command";

export const MotionType = {
    CHAR:     "char",
    LINEWISE: "linewise",
    FIND:     "find",
    TEXTOBJ:  "textobj",
} as const;

type MotionType = typeof MotionType[keyof typeof MotionType];

export type MotionContext =
    | { type: typeof MotionType.CHAR;     name: Motion; }
    | { type: typeof MotionType.LINEWISE; name: "line"; }
    | { type: typeof MotionType.FIND;     name: FindCommand;    arg: string; }
    | { type: typeof MotionType.TEXTOBJ;  name: TextObjectType; inner: boolean; }

