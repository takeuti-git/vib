import type { Operator, Sugar } from "./command";
import { MotionType, type MotionContext } from "./motionType";

type DesugaredContext = { operator: Operator; motion: MotionContext };

export const SUGAR_MAP: Record<Sugar, DesugaredContext> = {
    s: {
        operator: "c",
        motion: { type: MotionType.CHAR, name: "l" },
    },
    S: {
        operator: "c",
        motion: { type: MotionType.LINEWISE },
    },
    x: {
        operator: "d",
        motion: { type: MotionType.CHAR, name: "l" },
    },
    X: {
        operator: "d",
        motion: { type: MotionType.CHAR, name: "h" },
    },
    D: {
        operator: "d",
        motion: { type: MotionType.CHAR, name: "$" },
    },
    C: {
        operator: "c",
        motion: { type: MotionType.CHAR, name: "$" },
    },
    Y: {
        operator: "y",
        motion: { type: MotionType.CHAR, name: "$" },
    },
};
