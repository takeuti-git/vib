import type { EditorState } from "./types";
import { Line } from "./line";

export function createEditorState(): EditorState {
    return {
        row: 0,
        col: 0,
        px: 0,
        rowoff: 0,
        pxoff: 0,
        lines: [
            new Line()
        ],
    };
}
