import type { EditorState } from "../state";
import { CommandType, type CommandContext } from "./parser/commandType";

type FindOptions = {
    limit: number;
    reverse: boolean;
    stopBefore: boolean;
};

const FIRST_NON_WHITESPACE = /\S/;

/** 文字列の中で最初に登場する空白以外の文字の列番号を返す */
export function getFirstNonWhitespaceCol(text: string): number {
    return text.search(FIRST_NON_WHITESPACE);
}

/** viのf motion: 対象の文字と同じ位置までの移動量を求める */
export function getCountToNextChar(
    searchChar: string,
    text: string,
    { limit = 1, reverse = false, stopBefore = false }: Partial<FindOptions> = {},
): number {
    if (searchChar.length !== 1) throw new Error("searchChar must be one character");
    let count = 0;

    if (reverse) {
        for (let i = text.length - 1; i >= 0; i--) {
            count++;
            if (searchChar === text[i]) {
                limit--;
                if (limit === 0) {
                    if (stopBefore) count--;
                    return count;
                }
            }
        }
    } else {
        for (let i = 0; i < text.length; i++) {
            count++;
            if (searchChar === text[i]) {
                limit--;
                if (limit === 0) {
                    if (stopBefore) count--;
                    return count;
                }
            }
        }
    }
    return 0;
}

type Point = {
    row: number;
    col: number;
};

type MotionRange = {
    start: Point;
    end: Point;
    linewise: boolean;
};

export function getMotionRange(
    state: EditorState,
    ctx: CommandContext
): MotionRange | undefined {
    if (ctx.type !== CommandType.OPERATOR) {
        return undefined;
    }
    const outerCount = ctx.count === null ? 1 : ctx.count;
    const innerCount = ctx.innerCount === null ? 1 : ctx.innerCount;
    const count = outerCount * innerCount;

    const { row, col, lines } = state;
    const maxRow = lines.length - 1;
    const currLine = lines[row];
    if (!currLine) throw new Error("currLine is undefined");

    const motion = ctx.motion;
    const start: Point = { row, col };
    const end:   Point = { row, col };
    let linewise = false;

    switch (motion.type) {
        case "char": {
            if (motion.name === "k") {
                linewise = true;
                start.row = Math.max(0, start.row - count);
            }
            else if (motion.name === "h") {
                start.col = Math.max(0, start.col - count);
                end.col--;
            }
            else if (motion.name === "j") {
                linewise = true;
                end.row = Math.min(end.row + count, maxRow);
            }
            else if (motion.name === "l") {
                end.col = Math.min(end.col + count - 1, currLine.size - 1);
            }
            break;
        }
        case "linewise": {
            linewise = true;
            end.row = Math.min(end.row + count - 1, maxRow);
            break;
        }
        case "find": {
            if (motion.name === "f") {
                const text = currLine.text.slice(col + 1);
                const distance = getCountToNextChar(motion.arg, text, { limit: count });
                if (distance === 0) return undefined;
                end.col += distance;
            }
            else if (motion.name === "F") {
                const text = currLine.text.slice(0, col);
                const distance = getCountToNextChar(motion.arg, text, { limit: count, reverse: true });
                if (distance === 0) return undefined;
                start.col -= distance;
                end.col--;
            }
            else if (motion.name === "t") {
                const text = currLine.text.slice(col + 1);
                const distance = getCountToNextChar(motion.arg, text, { limit: count, stopBefore: true });
                if (distance === 0) return undefined;
                end.col += distance;
            }
            else if (motion.name === "T") {
                const text = currLine.text.slice(0, col);
                const distance = getCountToNextChar(motion.arg, text, { limit: count, reverse: true, stopBefore: true });
                if (distance === 0) return undefined;
                start.col -= distance;
                end.col--;
            }
            break;
        }
        case "textobj": {
            break;
        }
    }

    return { start, end, linewise };
}
