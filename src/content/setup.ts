import type { EditorConfig, EditorState } from "./types.js";
import { isFunctionKey, MOVE_KEYS } from "./keys.js";
import { deleteChar, insertChar, insertNewLine, moveCursor, scrollWindow } from "./edit.js";
import { render } from "./render.js";

export function setupListeners(canvas: HTMLCanvasElement, state: EditorState, config: EditorConfig) {
    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.code === "KeyV") {
            canvas.focus();
            return;
        }
        if (document.activeElement !== canvas) {
            console.log("canvas is not focused");
            return;
        }

        // processing
        processKeypress(e, state, config);
        scrollWindow(state, config);

        // drawing
        render(canvas, state, config);

        console.log("cx: ", state.px, "cxoff: ", state.pxoff, "col: ", state.col);
    });
}

function processKeypress(e: KeyboardEvent, state: EditorState, config: EditorConfig) {
    const key = e.key;
    if (isFunctionKey(key)) {
        return;
    }

    switch (key) {
        case "ArrowLeft":
            moveCursor(MOVE_KEYS.LEFT, state, config);
            break;
        case "ArrowRight":
            moveCursor(MOVE_KEYS.RIGHT, state, config);
            break;
        case "ArrowUp":
            moveCursor(MOVE_KEYS.UP, state, config);
            break;
        case "ArrowDown":
            moveCursor(MOVE_KEYS.DOWN, state, config);
            break;

        case "Delete":
        case "Backspace": {
            if (key === "Delete") {
                if (
                    state.row === state.lines.length - 1 &&
                    state.col === state.lines[state.row]!.size
                ) return;
                moveCursor(MOVE_KEYS.RIGHT, state, config);
            }
            deleteChar(state, config);
            break;
        }
        case "Enter": {
            insertNewLine(state);
            break;
        }
        default: {
            insertChar(key, state, config);
        }
    }
}
