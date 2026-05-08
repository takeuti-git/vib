export const ScrollCommand = {
    UP_HALF:      "UP_HALF",
    UP_FULL:      "UP_FULL",
    UP_ONELINE:   "UP_ONELINE",
    DOWN_HALF:    "DOWN_HALF",
    DOWN_FULL:    "DOWN_FULL",
    DOWN_ONELINE: "DOWN_ONELINE",
    RIGHT_CHAR:   "RIGHT_CHAR",
    RIGHT_HALF:   "RIGHT_HALF",
    LEFT_CHAR:    "LEFT_CHAR",
    LEFT_HALF:    "LEFT_HALF",
} as const;

export type ScrollCommand = (typeof ScrollCommand)[keyof typeof ScrollCommand];
