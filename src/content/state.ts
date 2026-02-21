import type { EditorState } from "./types";
import { Line } from "./line.js";

export function initEditorState(): EditorState {
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

export function resetEditorState(state: EditorState) {
    state.row = 0;
    state.col = 0;
    state.px = 0;
    state.rowoff = 0;
    state.pxoff = 0;
    state.lines = [];
}
