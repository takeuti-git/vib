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
            new Line("12345678901234567890123456789023456789"),
            new Line("hello world ハロー　ワールド!" ),
            new Line("12345678901234567890123456789023456789"),
            new Line("hello world ハロー　ワールド!" ),
        ],
    };
}
