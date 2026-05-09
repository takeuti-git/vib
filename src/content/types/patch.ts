import { type StructuredPatch } from "diff";
import type { Position } from "./motion";

export type Hunk = Pick<
    StructuredPatch["hunks"][number],
    "oldStart" | "newStart" | "lines"
>;

export type DiffStackElement = {
    position: Position,
    hunks: Hunk[]
};
