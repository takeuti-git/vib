import type { EditorConfig, EditorState } from "./types.js";
import { isFunctionKey, MOVE_KEYS } from "./keys.js";
import { deleteChar, insertChar, insertNewLine, moveCursor, scrollWindow } from "./edit.js";
import { render } from "./render.js";

export function setupListeners(
    canvas: HTMLCanvasElement,
    state: EditorState,
    config: EditorConfig
) {
    const input = document.getElementById("vib-input") as HTMLInputElement | null;
    if (!input) throw new Error("vib: input element not found.");

    canvas.addEventListener("click", () => {
        input.focus();
        render(canvas, state, config);
    });

    input.addEventListener("compositionstart", () => {
        input.style.zIndex = "9999";
    });

    input.addEventListener("compositionend", () => {
        insertChar(input.value, state, config);
        scrollWindow(state, config);
        render(canvas, state, config);
        input.value = "";
        input.style.zIndex = "-1";
    });

    input.addEventListener("keydown", (e) => {
        if (e.isComposing) return;
        input.value = "";

        // processing
        processKeypress(e, state, config);
        scrollWindow(state, config);

        // drawing
        render(canvas, state, config);
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
