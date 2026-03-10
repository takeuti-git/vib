import type { EditorState } from "../state";
import { CommandType, type CommandContext } from "./parser/commandType";
import { isSymbol, isWhitespace } from "./symbols";

type AtLeastTwoArray<T> = [T, T, ...T[]];

function isAtLeastTwoArray<T>(array: T[]): array is AtLeastTwoArray<T> {
    return array.length >= 2;
}

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
    return -1;
}

export function getDistanceWordForward(state: EditorState): number {
    let distance = 0;
    const currLine = state.lines[state.row];
    if (!currLine) throw new Error("currLine is undefined");
    const currLineText = currLine.text.slice(state.col);
    const nextLine = state.lines[state.row + 1];
    const nextLineText = nextLine ? nextLine.text : "";
    const searching = currLineText + " " + nextLineText;

    if (isWhitespace(searching)) {
        // カーソルから次の行の中で文字が1つもないとき
        return 1;
    }

    const isFirstSymbol = isSymbol(searching[0] as string);

    for (let i = 0; i < searching.length; i++) {
        const currChar = searching[i] as string;
        if (isWhitespace(currChar)) {
            // 空白が現れたら次の空白ではない文字まで移動する
            const sliced = searching.slice(i);
            for (let j = 0; j < sliced.length; j++) {
                if (!isWhitespace(sliced[j] as string)) {
                    break;
                }
                distance++;
            }
            break;
        }
        if (isFirstSymbol) {
            // 検索開始地点が記号の時
            if (!isSymbol(currChar)) {
                // 記号ではない文字に到達したらbreak
                break;
            }
        } else {
            // 検索開始地点が記号ではない時
            if (isSymbol(currChar)) {
                // 記号文字に到達したらbreak
                break;
            }
        }
        distance++;
    }

    return distance;
}

export function getDistanceWORDForward(state: EditorState): number {
    let distance = 0;
    const currLine = state.lines[state.row];
    if (!currLine) throw new Error("currLine is undefined");
    const currLineText = currLine.text.slice(state.col);
    const nextLine = state.lines[state.row + 1];
    const nextLineText = nextLine ? nextLine.text : "";
    const searching = currLineText + " " + nextLineText;

    for (let i = 0; i < searching.length; i++) {
        const currChar = searching[i] as string;
        const prevChar = searching[i - 1] as string;

        if (isWhitespace(prevChar) && !isWhitespace(currChar)) {
            // 空白と空白以外の分かれ目ならループを終了
            break;
        }
        distance++;
    }
    return distance;
}

export function getDistanceWordBackward(state: EditorState): number {
    let distance = 0;
    const prevLine = state.lines[state.row - 1];
    const prevLineText = prevLine ? prevLine.text : "";
    const currLine = state.lines[state.row];
    if (!currLine) throw new Error("currLine is undefined");
    const currLineText = currLine.text.slice(0, state.col);
    const searching = prevLineText + " " + currLineText;

    if (isWhitespace(searching)) {
        return 0;
    }

    const trimmed = searching.trimEnd();
    const lastChar = trimmed.slice(-1);
    const pauseAt: "normal" | "symbol" =
        isSymbol(lastChar) ? "symbol" : "normal";

    for (let i = searching.length - 1; i >= 0; i--) {
        distance++;
        const currChar = searching[i] as string;

        if (isWhitespace(currChar)) {
            // 空白文字を完全に無視して、distanceだけ増やす
            continue;
        }

        const prevChar = searching[i - 1] as string; // undefinedの可能性,影響なし

        if (isWhitespace(prevChar)) {
            break;
        }

        if (pauseAt === "symbol" && !isSymbol(prevChar)) {
            break;
        }
        else if (pauseAt === "normal" && isSymbol(prevChar)) {
            break;
        }
    }
    return distance;
}

export function getDistanceWORDBackward(state: EditorState): number {
    let distance = 0;
    const currLine = state.lines[state.row];
    if (!currLine) throw new Error("currLine is undefined");
    const currLineText = currLine.text.slice(0, state.col);
    const prevLine = state.lines[state.row - 1];
    const prevLineText = prevLine ? prevLine.text : "";
    const searching = prevLineText + " " + currLineText;

    for (let i = searching.length - 1; i >= 0; i--) {
        distance++;
        const currChar = searching[i] as string;
        const prevChar = searching[i - 1] as string; // undefinedの可能性,影響なし

        if (isWhitespace(prevChar) && !isWhitespace(currChar)) {
            break;
        }
    }
    return distance;
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
            if (motion.name === "k" || motion.name === "-") {
                linewise = true;
                start.row = Math.max(0, start.row - count);
            }
            else if (motion.name === "h") {
                start.col = Math.max(0, start.col - count);
                end.col--;
            }
            else if (motion.name === "j" || motion.name === "+") {
                linewise = true;
                end.row = Math.min(end.row + count, maxRow);
            }
            else if (motion.name === "l") {
                end.col = Math.min(end.col + count - 1, currLine.size - 1);
            }
            else if (motion.name === "^" || motion.name === "_") {
                start.col = getFirstNonWhitespaceCol(currLine.text);
                end.col = Math.max(0, end.col - 1);
            }
            else if (motion.name === "$") {
                end.col = currLine.text.length - 1;
            }
            else if (motion.name === "0") {
                start.col = 0;
                end.col = Math.max(0, end.col - 1);
            }
            else if (motion.name === "gg") {
                linewise = true;
                start.row = 0;
            }
            else if (motion.name === "G") {
                linewise = true;
                end.row = state.lines.length - 1;
            }
            else if (motion.name === "w") {
                end.col += getDistanceWordForward(state) - 1;
            }
            else if (motion.name === "W") {
                end.col += getDistanceWORDForward(state) - 1;
            }
            else if (motion.name === "b") {
                start.col = Math.max(0, start.col - getDistanceWordBackward(state));
                end.col--;
            }
            else if (motion.name === "B") {
                start.col = Math.max(0, start.col - getDistanceWORDBackward(state));
                end.col--;
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
                if (distance === -1) return undefined;
                end.col += distance;
            }
            else if (motion.name === "F") {
                const text = currLine.text.slice(0, col);
                const distance = getCountToNextChar(motion.arg, text, { limit: count, reverse: true });
                if (distance === -1) return undefined;
                start.col -= distance;
                end.col--;
            }
            else if (motion.name === "t") {
                const text = currLine.text.slice(col + 1);
                const distance = getCountToNextChar(motion.arg, text, { limit: count, stopBefore: true });
                if (distance === -1) return undefined;
                end.col += distance;
            }
            else if (motion.name === "T") {
                const text = currLine.text.slice(0, col);
                const distance = getCountToNextChar(motion.arg, text, { limit: count, reverse: true, stopBefore: true });
                if (distance === -1) return undefined;
                start.col -= distance;
                end.col--;
            }
            break;
        }
        case "textobj": {
            const text = currLine.text;
            const target = (
                motion.name === ")" ? "("
                : motion.name === "}" ? "{"
                : motion.name === "]" ? "["
                : motion.name === ">" ? "<"
                : motion.name
            );
            if (target === "\"" || target === "'" || target === "`") {
                const filtered: number[] = Array.from(text).map((ch, i) => {
                    return ch === target ? i : -1;
                }).filter(e => {
                    return e !== -1;
                });

                if (!isAtLeastTwoArray(filtered)) {
                    // 要素数が2未満のとき
                    return undefined;
                }

                const idx = filtered.indexOf(col);
                const isOnLast = idx === filtered.length - 1;
                const isOnLeftSide = idx % 2 === 0;
                const isOnRightSide = idx % 2 !== 0;

                if (isOnLast && isOnLeftSide) {
                    // カーソルがある位置が最後のtargetで、ペアの左側にいるとき
                    return undefined;
                }
                else if (col > Math.max(...filtered)) {
                    // カーソルより右側に有効なペアが存在しないとき
                    return undefined;
                }
                else if (col < Math.min(...filtered)) {
                    // カーソルが行の先頭にいるとき
                    start.col = filtered[0];
                    end.col = filtered[1];
                }
                else if (idx === -1) {
                    // カーソルがペアに挟まれているとき
                    for (let i = 0; i < filtered.length; i++) {
                        if (filtered[i]! > col) {
                            start.col = filtered[i - 1] as number;
                            end.col = filtered[i] as number;
                            break;
                        }
                    }
                }
                else if (isOnLeftSide) {
                    // カーソルがペアの前側に重なっているとき
                    end.col = filtered[idx + 1] as number;
                }
                else if (isOnRightSide) {
                    // カーソルがペアの後側に重なっているとき
                    start.col = filtered[idx - 1] as number;
                }

                if (motion.inner) {
                    start.col++;
                    end.col--;
                }
            }
            else if (target === "w") {
                const currChar = text.slice(col, col + 1);
                const isOnSymbol = isSymbol(currChar);
                const isOnWhitespace = isWhitespace(currChar);

                const checkFunc: (ch: string) => boolean =
                    isOnSymbol ? isSymbol
                    : isOnWhitespace ? isWhitespace
                    : (ch: string) => !isSymbol(ch) && !isWhitespace(ch);

                for (let i = col + 1; i < text.length; i++) {
                    // カーソルから右方向に探索
                    const ch = text[i] as string;
                    if (!checkFunc(ch)) break;
                    end.col++;
                }
                for (let i = col - 1; i >= 0; i--) {
                    // カーソルから左方向に探索
                    const ch = text[i] as string;
                    if (!checkFunc(ch)) break;
                    start.col--;
                }
            }
            else if (target === "W") {
                const currChar = text.slice(col, col + 1);
                const isOnWhitespace = isWhitespace(currChar);

                const checkFunc: (ch: string) => boolean =
                    isOnWhitespace ? isWhitespace
                    : (ch: string) => !isWhitespace(ch);

                for (let i = col + 1; i < text.length; i++) {
                    const ch = text[i] as string;
                    if (!checkFunc(ch)) break;
                    end.col++;
                }
                for (let i = col - 1; i >= 0; i--) {
                    const ch = text[i] as string;
                    if (!checkFunc(ch)) break;
                    start.col--;
                }
            }
            break;
        }
    }

    return { start, end, linewise };
}
