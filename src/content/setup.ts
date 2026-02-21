import type { EditorConfig, EditorState } from "./types.js";
import { isFunctionKey, MOVE_KEYS } from "./keys.js";
import { deleteChar, insertChar, insertNewLine, moveCursor, scrollWindow } from "./edit.js";
import { render } from "./render.js";
import { getLines } from "./line.js";

export function setupListeners(
    canvas: HTMLCanvasElement,
    input: HTMLInputElement,
    state: EditorState,
    config: EditorConfig
) {
    let destEl: HTMLInputElement | HTMLTextAreaElement | null = null;
    const setDestElValue = () => {
        if (!destEl) return;
        destEl.value = state.lines.map(l => l.text).join("\n");
    };

    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.code === "KeyV") {
            const currentEl = document.activeElement;
            if (currentEl === input) return;

            if (
                (currentEl instanceof HTMLInputElement) ||
                (currentEl instanceof HTMLTextAreaElement)
            ) {
                destEl = currentEl;
                input.focus();
                state.row = 0;
                state.col = 0;
                state.px = 0;
                state.rowoff = 0;
                state.pxoff = 0;
                state.lines = getLines(currentEl.value);
                render(canvas, state, config);
            }
        }
    });

    canvas.addEventListener("click", () => {
        input.focus();
        render(canvas, state, config);
    });

    input.addEventListener("compositionstart", () => {
        // 日本語変換が始まったとき
        input.style.zIndex = "9999";
    });

    input.addEventListener("compositionend", () => {
        // 日本語変換が終わったとき
        insertChar(input.value, state, config);
        scrollWindow(state, config);
        render(canvas, state, config);
        input.value = "";
        input.style.zIndex = "-1";
        setDestElValue();
    });

    input.addEventListener("keydown", (e) => {
        if (e.isComposing) return;

        if (e.altKey && e.code === "KeyV" && destEl) {
            destEl.focus();
            e.stopPropagation();
            return;
        }

        // processing
        processKeypress(e, state, config);
        scrollWindow(state, config);

        // drawing
        render(canvas, state, config);

        input.value = "";
        setDestElValue();
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
