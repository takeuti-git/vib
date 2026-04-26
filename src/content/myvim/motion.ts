import type { Motion } from "./parser/command";

export const MotionName = {
    left:              "left",
    down:              "down",
    up:                "up",
    right:             "right",
    word_forward:      "word_forward",
    word_backward:     "word_backward",
    word_tail:         "word_tail",
    WORD_forward:      "WORD_forward",
    WORD_backward:     "WORD_backward",
    WORD_tail:         "WORD_tail",
    first:             "first",
    last:              "last",
    firstChar:         "firstChar",
    firstCharNextLine: "firstCharNextLine",
    firstCharPrevLine: "firstCharPrevLine",
    firstLine:         "firstLine",
    lastLine:          "lastLine",
} as const;

export type MotionName = (typeof MotionName)[keyof typeof MotionName];

// remaining = ["H","L","%"]
// @ts-expect-error unimplemented motions
export const MOTION_KEY_TO_NAME: Record<Motion, MotionName> = {
    "h":     MotionName.left,
    "j":     MotionName.down,
    "k":     MotionName.up,
    "l":     MotionName.right,
    "w":     MotionName.word_forward,
    "b":     MotionName.word_backward,
    "e":     MotionName.word_tail,
    "W":     MotionName.WORD_forward,
    "B":     MotionName.WORD_backward,
    "E":     MotionName.WORD_tail,
    "0":     MotionName.first,
    "$":     MotionName.last,
    "^":     MotionName.firstChar,
    "_":     MotionName.firstChar,
    "+":     MotionName.firstCharNextLine,
    "Enter": MotionName.firstCharNextLine,
    "-":     MotionName.firstCharPrevLine,
    "gg":    MotionName.firstLine,
    "G":     MotionName.lastLine,
};
