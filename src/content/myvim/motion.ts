import type { EditorState } from "../state";
import { CommandType, type CommandContext } from "./parser/commandType";

const FIRST_NON_WHITESPACE = /\S/;

/** 文字列の中で最初に登場する空白以外の文字の列番号を返す */
export function getFirstNonWhitespaceCol(text: string): number {
    return text.search(FIRST_NON_WHITESPACE);
}

/** viのf motion: 対象の文字と同じ位置までの移動量を求める */
export function getCountToNextChar(searchChar: string, text: string, reverse = false): number {
    searchChar = searchChar[0] as string;
    let count = 0;
    if (reverse) {
        const reversed = text.split("").reverse().join("");
        count = reversed.search(new RegExp(searchChar)) + 1;
    }
    else {
        count = text.search(new RegExp(searchChar)) + 1;
    }
    return count;
}

export function getCountForNextChar(searchChar: string, text: string, reverse = false): number {
    searchChar = searchChar[0] as string;
    let count = 0;
    if (reverse) {
        const reversed = text.split("").reverse().join("");
        count = reversed.search(new RegExp(searchChar));
    }
    else {
        count = text.search(new RegExp(searchChar));
    }
    return count;
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
    // if (ctx.type !== CommandType.MOTION && ctx.type !== CommandType.OPERATOR) {
    //     return undefined;
    // }
    if (ctx.type !== CommandType.OPERATOR) {
        return undefined;
    }
    const outerCount = ctx.count === null ? 1 : ctx.count;
    const innerCount = ctx.innerCount === null ? 1 : ctx.innerCount;
    const count = outerCount * innerCount;

    const { row, col, lines } = state;
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
            }
            else if (motion.name === "j") {
                linewise = true;
                end.row = Math.min(end.row + count, lines.length - 1);
            }
            else if (motion.name === "l") {
                end.col = Math.min(end.col + count - 1, currLine.size - 1);
            }
            break;
        }
        // case "linewise": {
        //     break;
        // }
        // case "find":
        // case "textobj":
    }

    return { start, end, linewise };
}
