export const ScrollCommand = {
    UP_HALF:   "UP_HALF",
    DOWN_HALF: "DOWN_HALF",
    UP_FULL:   "UP_FULL",
    DOWN_FULL: "DOWN_FULL",
} as const;

export type ScrollCommand = (typeof ScrollCommand)[keyof typeof ScrollCommand];
