import type { Operator } from "./parser/normalCommand";

export const OperatorName = {
    DELETE:     "DELETE",
    CHANGE:     "CHANGE",
    YANK:       "YANK",
    /** INCREASE_INDENT */
    INC_INDENT: "INC_INDENT",
    /** DECREASE_INDENT */
    DEC_INDENT: "DEC_INDENT",
} as const;

export type OperatorName = (typeof OperatorName)[keyof typeof OperatorName];

export const OPERATOR_KEY_TO_NAME: Record<Operator, OperatorName> = {
    "d": OperatorName.DELETE,
    "c": OperatorName.CHANGE,
    "y": OperatorName.YANK,
    "<": OperatorName.DEC_INDENT,
    ">": OperatorName.INC_INDENT,
};
