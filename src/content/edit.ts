import type { EditorConfig, EditorState } from "./types";
import { isIgnoreKey, MOVE_KEYS, type MoveKey } from "./keys.js";
import { Line } from "./line.js";
import { calcWidth, cxToCol } from "./utils.js";

export function scrollWindow(state: EditorState, config: EditorConfig) {
    if (state.row < state.rowoff) {
        // decrease rowoff
        state.rowoff = state.row;
    }
    if (state.row >= state.rowoff + config.screenrows) {
        // increase rowoff
        state.rowoff = state.row - config.screenrows + 1;
    }
    if (state.px < state.pxoff) {
        // decrease cxoff
        state.pxoff = state.px;
    }
    const fontsize = config.baseFontSize / 2;
    const screenWidth = config.screencols * fontsize;
    if (state.px >= state.pxoff + screenWidth) {
        // increase cxoff
        state.pxoff = state.px - (fontsize * config.screencols) + fontsize;
    }
}

export function moveCursor(key: MoveKey, state: EditorState, config: EditorConfig) {
    switch (key) {
        case MOVE_KEYS.LEFT: {
            if (state.col !== 0) {
                const prevChar = state.lines[state.row]!.text.slice(state.col - 1, state.col);
                state.px -= calcWidth(prevChar, config);
                state.col--;
            } else if (state.row > 0) {
                const prevLine = state.lines[state.row - 1] as Line;
                const prevLineLen = prevLine.size;
                state.row--;
                state.col = prevLineLen;
                state.px = calcWidth(prevLine.text, config);
            }
            break;
        }
        case MOVE_KEYS.RIGHT: {
            const curLine = state.lines[state.row] as Line;
            if (state.col < curLine.size) {
                const currChar = curLine.text.slice(state.col, state.col + 1);
                state.px += calcWidth(currChar, config);
                state.col++;
            } else if (state.lines[state.row + 1] && state.col === curLine.size) {
                state.row++;
                state.col = 0;
                state.px = 0;
            }
            break;
        }
        case MOVE_KEYS.UP: {
            if (state.row !== 0) {
                const cxBeforeMove = state.px;
                const prevLine = state.lines[state.row - 1] as Line;
                state.row--;
                state.px = Math.min(state.px, calcWidth(prevLine.text, config));
                state.col = cxToCol(state.px, prevLine.text, config);
                state.px = calcWidth(prevLine.text.slice(0, state.col), config);
                if (state.px >= cxBeforeMove + config.baseFontSize / 2) {
                    // 半角文字から全角文字に移動する時、移動前が後ろ側なら寄せる
                    state.px -= config.baseFontSize;
                    state.col--;
                }
            }
            break;
        }
        case MOVE_KEYS.DOWN: {
            if (state.row < state.lines.length - 1) {
                const cxBeforeMove = state.px;
                const nextLine = state.lines[state.row + 1] as Line;
                state.row++;
                state.px = Math.min(state.px, calcWidth(nextLine.text, config));
                state.col = cxToCol(state.px, nextLine.text, config);
                state.px = calcWidth(nextLine.text.slice(0, state.col), config);
                if (state.px >= cxBeforeMove + config.baseFontSize / 2) {
                    // 半角文字から全角文字に移動する時、移動前が後ろ側なら寄せる
                    state.px -= config.baseFontSize;
                    state.col--;
                }
            }
            break;
        }
    }
}

function insertRow(at: number, text: string, state: EditorState) {
    if (at < 0 || at > state.lines.length) return;
    state.lines.splice(at, 0, new Line(text));
}

function deleteRow(at: number, state: EditorState) {
    if (at < 0 || at >= state.lines.length) return;
    state.lines.splice(at, 1);
}

function appendTextToLine(line: Line, text: string) {
    line.text += text;
}

function insertTextInLine(line: Line, text: string, col: number) {
    const before = line.text.slice(0, col);
    const after = line.text.slice(col);
    line.text = before + text + after;
}

export function insertNewLine(state: EditorState) {
    const line = state.lines[state.row] as Line;
    const buf = line.text.slice(state.col);
    line.text = line.text.slice(0, state.col);
    state.row++;
    state.col = 0;
    state.px = 0;
    insertRow(state.row, buf, state);
}

export function insertChar(ch: string, state: EditorState, config: EditorConfig) {
    if (isIgnoreKey(ch)) return;

    const line = state.lines[state.row] as Line;
    if (state.col >= line.size) {
        appendTextToLine(line, ch);
    } else {
        insertTextInLine(line, ch, state.col);
    }
    state.px += calcWidth(ch, config);
    state.col += ch.length;
}

export function deleteChar(state: EditorState, config: EditorConfig) {
    if (state.col === 0 && state.row === 0) return;

    const line = state.lines[state.row] as Line;
    const text = line.text;
    if (state.col > 0) {
        const targetChar = text.slice(state.col - 1, state.col);
        const deleted = text.slice(0, state.col - 1) + text.slice(state.col);
        line.text = deleted;
        state.col--;
        state.px -= calcWidth(targetChar, config);
    } else {
        // append two lines
        const prevLine = state.lines[state.row - 1] as Line;
        state.col = prevLine.size;
        state.px = calcWidth(prevLine.text, config);
        appendTextToLine(prevLine, line.text);
        deleteRow(state.row, state);
        state.row--;
    }
}
