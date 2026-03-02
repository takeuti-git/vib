import type { Operator, Sugar } from "./command";
import { MotionType, type MotionContext } from "./motionType";

type DesugaredContext = { operator: Operator, motion: MotionContext };

export const SUGAR_MAP: Record<Sugar, DesugaredContext> = {
    s: {
        operator: "c",
        motion: { type: MotionType.CHAR, name: "l" }
    },
    S: {
        operator: "c",
        motion: { type: MotionType.LINEWISE, name: "line" }
    },
    x: {
        operator: "d",
        motion: { type: MotionType.CHAR, name: "l" }
    },
    X: {
        operator: "d",
        motion: { type: MotionType.CHAR, name: "h" }
    },
};

