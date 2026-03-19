import type { Line } from "../line";
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

type HorizontalMotion = {
    distance: number;
    destRow: number;
    destCol: number;
};

type MovingCtx = {
    distance: number;
    line: Line;
    row: number;
    col: number;
    doStop: boolean;
};

type ForwardMovingCtx = MovingCtx & {
    moveToNext: "any" | "normal" | "symbol";
}

function wordHelper(ctx: ForwardMovingCtx): void {
    for (; ctx.col < ctx.line.size; ctx.col++) {
        const currCh = ctx.line.text[ctx.col] ?? " ";
        const isSpace = isWhitespace(currCh);
        if (isSpace) ctx.moveToNext = "any";

        ctx.distance++;

        if (
            (ctx.moveToNext === "any" && !isSpace) ||
            (ctx.moveToNext === "normal" && !isSpace && !isSymbol(currCh)) ||
            (ctx.moveToNext === "symbol" && isSymbol(currCh))
        ) {
            ctx.doStop = true;
            return;
        }
    }
    ctx.moveToNext = "any"; // 改行後に必ずanyに設定
}

function WORDHelper(ctx: ForwardMovingCtx): void {
    for (; ctx.col < ctx.line.size; ctx.col++) {
        const currCh = ctx.line.text[ctx.col] as string;
        const prevCh = ctx.line.text[ctx.col - 1] ?? " "; // 0文字目より前は空白として扱う
        ctx.distance++;
        if (isWhitespace(prevCh) && !isWhitespace(currCh)) {
            ctx.doStop = true;
            return;
        }
    }
}

export function moveForward(state: EditorState, seperator: "word" | "WORD"): HorizontalMotion {
    const currLine = state.lines[state.row];
    if (!currLine) {
        throw new Error("currLine is undefined");
    }

    const startRow = state.row;
    const startCol = state.col;

    const ctx: ForwardMovingCtx = {
        distance: 0,
        line: currLine,
        row: state.row,
        col: state.col,
        doStop: false,
        moveToNext: "any",
    };

    if (seperator === "word") {
        const startCh = currLine.text[startCol] ?? " ";
        ctx.moveToNext =
            isWhitespace(startCh) ? "any"
            : isSymbol(startCh) ? "normal"
            : "symbol";
    }

    const searchHorizontally =
        seperator === "word"
        ? wordHelper
        : WORDHelper;

    for (; ctx.row < state.lines.length; ctx.row++) {
        const line = state.lines[ctx.row];
        if (!line) throw new Error("line is undefined");
        ctx.line = line;

        if (line.text === "") {
            if (ctx.row !== startRow) {
                ctx.distance++;
                break;
            }

            const nextLn = state.lines[ctx.row + 1];
            if (nextLn && nextLn.text === "") {
                ctx.distance++;
                break;
            }
            continue;
        }

        ctx.col = (ctx.row === startRow) ? startCol + 1 : 0; // 実行時の行でないなら行頭から探索

        searchHorizontally(ctx); // seperatorごとに異なる行内の探索処理を抽象化

        if (ctx.doStop) break;
        ctx.distance++; // 改行分の移動量を加算
    }

    return { distance: ctx.distance, destRow: ctx.row, destCol: ctx.col };
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

type TailMovingCtx = MovingCtx & {
    stopAt: "unknown" | "any" | "normal" | "symbol";
};

/** 単語の末尾まで移動する */
export function moveTail(state: EditorState, seperator: "word" | "WORD"): HorizontalMotion {
    const currLine = state.lines[state.row];
    if (!currLine) throw new Error("currLine is undefined");

    const nextChar = currLine.text[state.col + 1] ?? " ";

    const ctx: TailMovingCtx = {
        distance: 0,
        line: currLine,
        row: state.row,
        col: state.col,
        doStop: false,
        stopAt: "unknown",
    };

    if (seperator === "WORD") {
        ctx.stopAt = (
            isWhitespace(nextChar) ? "unknown" :
            "any"
        );
    } else {
        ctx.stopAt = (
            isWhitespace(nextChar) ? "unknown" :
            isSymbol(nextChar) ? "symbol" :
            "normal"
        );
    }

    const startRow = state.row;
    const startCol = state.col;

    if (ctx.stopAt === "unknown") {
        // 行を跨いで空白でない文字の先頭まで移動する
        for (; ctx.row < state.lines.length; ctx.row++) {
            const line = state.lines[ctx.row];
            if (!line) throw new Error("line is undefined");

            ctx.col = (ctx.row === startRow) ? startCol + 1 : 0;

            for (; ctx.col < line.size; ctx.col++) {
                const ch = line.text[ctx.col] as string;
                ctx.distance++;
                if (isWhitespace(ch)) continue;

                if (seperator === "word") {
                    // 連続した空白を抜けてから最初に現れた文字に応じて、停止位置を決定
                    if (isSymbol(ch)) {
                        ctx.stopAt = "symbol";
                    } else {
                        ctx.stopAt = "normal";
                    }
                }
                ctx.doStop = true;
                break;
            }
            if (ctx.doStop) break;
            ctx.distance++; // 改行分を加算
        }
    }

    const targetLine = state.lines[ctx.row];
    if (!targetLine) {
        // targetLine is EOF; fastforward
        const distance = ctx.row - state.row;
        return { distance, destRow: state.lines.length - 1, destCol: ctx.col }; 
    }

    let stopCondition: (ch: string) => boolean;

    // 停止する条件を決定する
    if (seperator === "WORD") {
        stopCondition = isWhitespace; // WORD移動では空白のみを考慮する

    } else if (ctx.stopAt === "symbol") {
        stopCondition = (ch) => !isSymbol(ch);

    } else if (ctx.stopAt === "normal") {
        stopCondition = (ch) => isSymbol(ch) || isWhitespace(ch);

    } else {
        throw new Error("invalid stopAt: " + ctx.stopAt);
    }

    for (; ctx.col < targetLine.size; ctx.col++) {
        const nextCh = targetLine.text[ctx.col + 1] ?? " ";
        if (stopCondition(nextCh)) break;
        ctx.distance++;
    }

    return { distance: ctx.distance, destRow: ctx.row, destCol: ctx.col };
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
                // w/W motionは絶対に複数行を対象範囲にしない
                const { distance } = moveForward(state, "word");
                const destCol = end.col + distance - 1; // 到達文字は含めないため1を引く
                end.col = Math.min(currLine.size - 1, destCol); // 行を超えないように
            }
            else if (motion.name === "W") {
                const { distance } = moveForward(state, "WORD");
                const destCol = end.col + distance - 1;
                end.col = Math.min(currLine.size - 1, destCol);
            }
            else if (motion.name === "b") {
                // b/B motionは複数行にまたがることがある
                start.col = Math.max(0, start.col - getDistanceWordBackward(state));
                end.col--;
            }
            else if (motion.name === "B") {
                start.col = Math.max(0, start.col - getDistanceWORDBackward(state));
                end.col--;
            }
            else if (motion.name === "e") {
                // e/E motionは複数行にまたがることがある
                const { destRow, destCol } = moveTail(state, "word");
                end.row = destRow;
                end.col = destCol;
            }
            else if (motion.name === "E") {
                const { destRow, destCol } = moveTail(state, "WORD");
                end.row = destRow;
                end.col = destCol;
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
