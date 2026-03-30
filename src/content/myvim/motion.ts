import type { Line } from "../line";
import type { EditorState } from "../state";
import type { MotionRange, RC } from "../types/motion";
import type { FindMoveOptions } from "./findCommand";
import { CommandType, type CommandContext } from "./parser/commandType";
import { isSymbol, isWhitespace } from "./symbols";

type AtLeastTwoArray<T> = [T, T, ...T[]];

function isAtLeastTwoArray<T>(array: T[]): array is AtLeastTwoArray<T> {
    return array.length >= 2;
}

const FIRST_NON_WHITESPACE = /\S/;

/** 文字列の中で最初に登場する空白以外の文字の列番号を返す */
export function getFirstNonWhitespaceCol(text: string): number {
    return text.search(FIRST_NON_WHITESPACE);
}

/** viのf motion: 対象の文字と同じ位置までの移動量を求める */
export function getCountToNextChar(
    searchChar: string,
    text: string,
    {
        limit = 1,
        reverse = false,
        stopBefore = false,
        ignoreNextCh = false,
    }: Partial<FindMoveOptions> = {},
): number {
    if (limit <= 0) throw new Error("limit must exceed 0");
    if (searchChar.length !== 1) throw new Error("searchChar must be one character");
    let distance = 0;

    let i = reverse ? text.length - 1 : 0;
    if (ignoreNextCh) {
        distance++;
        if (reverse) {
            i--;
        } else {
            i++;
        }
    }
    for (; reverse ? i >= 0 : i < text.length; reverse ? i-- : i++) {
        distance++;
        if (searchChar === text[i]) {
            limit--;
            if (limit === 0) {
                if (stopBefore) distance--;
                return distance;
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
};

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

export function moveForward(state: EditorState, separator: "word" | "WORD"): HorizontalMotion {
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

    if (separator === "word") {
        const startCh = currLine.text[startCol] ?? " ";
        ctx.moveToNext = isWhitespace(startCh) ? "any" : isSymbol(startCh) ? "normal" : "symbol";
    }

    const searchHorizontally = separator === "word" ? wordHelper : WORDHelper;

    for (; ctx.row < state.lines.length; ctx.row++) {
        const line = state.lines[ctx.row];
        if (!line) throw new Error("line is undefined");
        ctx.line = line;

        if (line.isEmpty()) {
            if (ctx.row !== startRow) {
                ctx.distance++;
                break;
            }

            const nextLn = state.lines[ctx.row + 1];
            if (nextLn && nextLn.isEmpty()) {
                ctx.distance++;
                break;
            }
            continue;
        }

        ctx.col = ctx.row === startRow ? startCol + 1 : 0; // 実行時の行でないなら行頭から探索

        searchHorizontally(ctx); // separatorごとに異なる行内の探索処理を抽象化

        if (ctx.doStop) break;
        ctx.distance++; // 改行分の移動量を加算
    }

    return { distance: ctx.distance, destRow: ctx.row, destCol: ctx.col };
}

type BackwardMovingCtx = MovingCtx & {
    stopAt: "unknown" | "any" | "normal" | "symbol";
};

export function moveBackward(state: EditorState, separator: "word" | "WORD"): HorizontalMotion {
    const currLine = state.lines[state.row];
    if (!currLine) throw new Error("currLine is undefined");

    const ctx: BackwardMovingCtx = {
        distance: 0,
        line: currLine,
        row: state.row,
        col: state.col,
        doStop: false,
        stopAt: "unknown",
    };

    const prevChar = currLine.text[state.col - 1] ?? " ";

    if (separator === "WORD") {
        ctx.stopAt = isWhitespace(prevChar) ? "unknown" : "any";
    } else {
        ctx.stopAt = isWhitespace(prevChar) ? "unknown" : isSymbol(prevChar) ? "symbol" : "normal";
    }

    const startRow = state.row;

    if (ctx.stopAt === "unknown") {
        for (; ctx.row >= 0; ctx.row--) {
            const line = state.lines[ctx.row];
            if (!line) throw new Error("line is undefined");

            if (line.isEmpty()) {
                if (ctx.row !== startRow) {
                    // 移動先が何もない行ならそこで止まる
                    break;
                }

                ctx.distance++;
                const prevLn = state.lines[ctx.row - 1];
                if (prevLn && prevLn.isEmpty()) {
                    break;
                }
                continue;
            }

            ctx.col = ctx.row === startRow ? state.col - 1 : line.size - 1;

            for (; ctx.col >= 0; ctx.col--) {
                ctx.distance++;
                const ch = line.text[ctx.col] as string;
                if (isWhitespace(ch)) continue;

                if (separator === "word") {
                    // 連続した空白を抜けてから最初に現れた文字に応じて停止位置を決定
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
            ctx.distance++;
        }
    }

    ctx.row = Math.max(0, ctx.row);
    ctx.col = Math.max(0, ctx.col);

    const targetLine = state.lines[ctx.row];
    if (!targetLine) {
        const distance = state.col;
        return { distance, destRow: 0, destCol: 0 };
    }

    let stopCondition: (currCh: string, prevCh: string) => boolean;
    if (separator === "WORD") {
        stopCondition = (currCh, prevCh) => isWhitespace(prevCh) && !isWhitespace(currCh);
    } else if (ctx.stopAt === "normal") {
        stopCondition = (_, prevCh) => isWhitespace(prevCh) || isSymbol(prevCh);
    } else if (ctx.stopAt === "symbol") {
        stopCondition = (_, prevCh) => isWhitespace(prevCh) || !isSymbol(prevCh);
    } else {
        stopCondition = () => false;
    }

    if (targetLine.size >= 1) {
        for (; ctx.col >= 0; ctx.col--) {
            const ch = targetLine.text[ctx.col] as string;
            const prevCh = targetLine.text[ctx.col - 1] ?? " ";
            if (stopCondition(ch, prevCh)) break;
            ctx.distance++;
        }
    }

    return { distance: ctx.distance, destRow: ctx.row, destCol: ctx.col };
}

type TailMovingCtx = MovingCtx & {
    stopAt: "unknown" | "any" | "normal" | "symbol";
};

/** 単語の末尾まで移動する */
export function moveTail(state: EditorState, separator: "word" | "WORD"): HorizontalMotion {
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

    if (separator === "WORD") {
        ctx.stopAt = isWhitespace(nextChar) ? "unknown" : "any";
    } else {
        ctx.stopAt = isWhitespace(nextChar) ? "unknown" : isSymbol(nextChar) ? "symbol" : "normal";
    }

    const startRow = state.row;
    const startCol = state.col;

    if (ctx.stopAt === "unknown") {
        // 行を跨いで空白でない文字の先頭まで移動する
        for (; ctx.row < state.lines.length; ctx.row++) {
            const line = state.lines[ctx.row];
            if (!line) throw new Error("line is undefined");

            ctx.col = ctx.row === startRow ? startCol + 1 : 0;

            for (; ctx.col < line.size; ctx.col++) {
                const ch = line.text[ctx.col] as string;
                ctx.distance++;
                if (isWhitespace(ch)) continue;

                if (separator === "word") {
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
    if (separator === "WORD") {
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

export function getMotionRange(state: EditorState, ctx: CommandContext): MotionRange | undefined {
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
    const start: RC = { row, col };
    const end: RC = { row, col };
    let linewise = false;

    switch (motion.type) {
        case "char": {
            if (motion.name === "k" || motion.name === "-") {
                linewise = true;
                start.row = Math.max(0, start.row - count);
            } else if (motion.name === "h") {
                if (col === 0) {
                    return undefined;
                }
                start.col = Math.max(0, start.col - count);
                end.col--;
            } else if (motion.name === "j" || motion.name === "+") {
                linewise = true;
                end.row = Math.min(end.row + count, maxRow);
            } else if (motion.name === "l") {
                end.col = Math.min(end.col + count - 1, currLine.size - 1);
                end.col = Math.max(0, end.col);
            } else if (motion.name === "^" || motion.name === "_") {
                start.col = getFirstNonWhitespaceCol(currLine.text);
                end.col = Math.max(0, end.col - 1);
            } else if (motion.name === "$") {
                end.col = currLine.text.length - 1;
            } else if (motion.name === "0") {
                start.col = 0;
                end.col = Math.max(0, end.col - 1);
            } else if (motion.name === "gg") {
                linewise = true;
                start.row = 0;
            } else if (motion.name === "G") {
                linewise = true;
                end.row = state.lines.length - 1;
            } else if (motion.name === "w" || motion.name === "W") {
                // w/W motionは絶対に複数行を対象範囲にしない
                const sep = motion.name === "w" ? "word" : "WORD";
                const { distance } = moveForward(state, sep);
                const destCol = end.col + distance - 1; // 到達文字は含めないため1を引く
                end.col = Math.min(currLine.size - 1, destCol); // 行を超えないように
            } else if (motion.name === "b" || motion.name === "B") {
                if (state.col === 0 && state.row === 0) return undefined;
                // b/B motionは複数行にまたがることがある
                const sep = motion.name === "b" ? "word" : "WORD";
                const { destRow, destCol } = moveBackward(state, sep);
                start.row = destRow;
                start.col = destCol;
                if (state.col === 0) {
                    end.row = Math.max(0, end.row - 1);
                    const prevLn = state.lines[end.row];
                    if (prevLn) {
                        end.col = Math.max(0, prevLn.size - 1);
                    }
                } else {
                    end.col--; // colが1以上のため安全に下げられる
                }
            } else if (motion.name === "e" || motion.name === "E") {
                // e/E motionは複数行にまたがることがある
                const sep = motion.name === "e" ? "word" : "WORD";
                const { destRow, destCol } = moveTail(state, sep);
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
            } else if (motion.name === "F") {
                const text = currLine.text.slice(0, col);
                const distance = getCountToNextChar(motion.arg, text, {
                    limit: count,
                    reverse: true,
                });
                if (distance === -1) return undefined;
                start.col -= distance;
                end.col--;
            } else if (motion.name === "t") {
                const text = currLine.text.slice(col + 1);
                const distance = getCountToNextChar(motion.arg, text, {
                    limit: count,
                    stopBefore: true,
                });
                if (distance === -1) return undefined;
                end.col += distance;
            } else if (motion.name === "T") {
                const text = currLine.text.slice(0, col);
                const distance = getCountToNextChar(motion.arg, text, {
                    limit: count,
                    reverse: true,
                    stopBefore: true,
                });
                if (distance === -1) return undefined;
                start.col -= distance;
                end.col--;
            }
            break;
        }
        case "textobj": {
            const text = currLine.text;
            const target =
                motion.name === ")"
                    ? "("
                    : motion.name === "}"
                      ? "{"
                      : motion.name === "]"
                        ? "["
                        : motion.name === ">"
                          ? "<"
                          : motion.name;
            if (target === '"' || target === "'" || target === "`") {
                const filtered: number[] = Array.from(text)
                    .map((ch, i) => {
                        return ch === target ? i : -1;
                    })
                    .filter((e) => {
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
                } else if (col > Math.max(...filtered)) {
                    // カーソルより右側に有効なペアが存在しないとき
                    return undefined;
                } else if (col < Math.min(...filtered)) {
                    // カーソルが行の先頭にいるとき
                    start.col = filtered[0];
                    end.col = filtered[1];
                } else if (idx === -1) {
                    // カーソルがペアに挟まれているとき
                    for (let i = 0; i < filtered.length; i++) {
                        if (filtered[i]! > col) {
                            start.col = filtered[i - 1] as number;
                            end.col = filtered[i] as number;
                            break;
                        }
                    }
                } else if (isOnLeftSide) {
                    // カーソルがペアの前側に重なっているとき
                    end.col = filtered[idx + 1] as number;
                } else if (isOnRightSide) {
                    // カーソルがペアの後側に重なっているとき
                    start.col = filtered[idx - 1] as number;
                }

                if (motion.inner) {
                    start.col++;
                    end.col--;
                }
            } else if (target === "w") {
                const currChar = text.slice(col, col + 1);
                const isOnSymbol = isSymbol(currChar);
                const isOnWhitespace = isWhitespace(currChar);

                const checkFunc: (ch: string) => boolean = isOnSymbol
                    ? isSymbol
                    : isOnWhitespace
                      ? isWhitespace
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
            } else if (target === "W") {
                const currChar = text.slice(col, col + 1);
                const isOnWhitespace = isWhitespace(currChar);

                const checkFunc: (ch: string) => boolean = isOnWhitespace
                    ? isWhitespace
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
            } else if (target === "[" || target === "{" || target === "(" || target === "<") {
                const currCh = currLine.text[col] ?? " ";
                const openingCh = target;
                const closingCh =
                    target === "[" ? "]" : target === "{" ? "}" : target === "(" ? ")" : ">";

                if (currCh === openingCh) {
                    const fwClosing = searchPairCharForward(
                        lines,
                        row,
                        col + 1,
                        closingCh,
                        openingCh,
                    );
                    if (!fwClosing) return undefined;
                    end.row = fwClosing.row;
                    end.col = fwClosing.col;
                } else if (currCh === closingCh) {
                    const bwOpening = searchPairCharBackward(
                        lines,
                        row,
                        col - 1,
                        openingCh,
                        closingCh,
                    );
                    if (!bwOpening) return undefined;
                    start.row = bwOpening.row;
                    start.col = bwOpening.col;
                } else {
                    const bwOpening = searchPairCharBackward(lines, row, col, openingCh, closingCh);
                    // 後方に有効なopeningChが見つからなければ、カーソル以降に存在する次の有効なペアの始まりを探索
                    if (bwOpening) {
                        const fwClosing = searchPairCharForward(
                            lines,
                            row,
                            col,
                            closingCh,
                            openingCh,
                        );
                        if (!fwClosing) return undefined;
                        start.row = bwOpening.row;
                        start.col = bwOpening.col;
                        end.row = fwClosing.row;
                        end.col = fwClosing.col;
                    } else {
                        const fwOpening = searchPairCharForward(
                            lines,
                            row,
                            col,
                            openingCh,
                            closingCh,
                        );
                        if (!fwOpening) return undefined;
                        const fwClosing = searchPairCharForward(
                            lines,
                            fwOpening.row,
                            fwOpening.col + 1,
                            closingCh,
                            openingCh,
                        );
                        if (!fwClosing) return undefined;
                        start.row = fwOpening.row;
                        start.col = fwOpening.col;
                        end.row = fwClosing.row;
                        end.col = fwClosing.col;
                    }
                }

                if (motion.inner) {
                    start.col++;
                    end.col--;
                    // 溢れるなら
                    if (start.col === lines[start.row]!.size) {
                        start.row++;
                        start.col = 0;
                    }
                    if (end.col === -1) {
                        end.row--;
                        end.col = lines[end.row]!.size - 1;
                    }
                }
            }
            break;
        }
    }

    if (start.row === -1 || start.col === -1 || end.row === -1 || end.col === -1) {
        console.error(start, end);
        throw new Error("unexpected negative value");
    }

    return { start, end, linewise };
}

function* iteratePosition(
    lines: readonly Line[],
    row: number,
    col: number,
    direction: "fw" | "bw",
): Generator<{ row: number; col: number; ch: string }> {
    const forward = direction === "fw";
    const startRow = row;

    for (; forward ? row < lines.length : row >= 0; forward ? row++ : row--) {
        const line = lines[row];
        if (!line) throw new Error("line is undefined");
        if (line.isEmpty()) continue;

        if (row !== startRow) col = forward ? 0 : line.size - 1;

        for (; forward ? col < line.size : col >= 0; forward ? col++ : col--) {
            const ch = line.text[col];
            if (!ch) throw new Error("ch is undefined");
            yield { row, col, ch };
        }
    }
}

function searchPairChar(
    lines: readonly Line[],
    startRow: number,
    startCol: number,
    targetCh: string,
    pairCh: string,
    direction: "fw" | "bw",
): RC | undefined {
    if (targetCh === pairCh)
        throw new Error(`duplicated arguments: targetCh: "${targetCh}", pairCh: "${pairCh}"`);
    if (targetCh.length !== 1) throw new Error(`targetCh must be a char. targetCh: "${targetCh}"`);
    if (pairCh.length !== 1) throw new Error(`pairCh must be a char. pairCh: "${pairCh}"`);
    let depth = 0;

    for (const { row, col, ch } of iteratePosition(lines, startRow, startCol, direction)) {
        if (ch === targetCh) {
            if (depth === 0) {
                return { row, col };
            }
            depth--;
        } else if (ch === pairCh) {
            depth++;
        }
    }

    return undefined;
}

/** helper for searchPairChar */
function searchPairCharForward(
    lines: readonly Line[],
    startRow: number,
    startCol: number,
    targetCh: string,
    pairCh: string,
) {
    return searchPairChar(lines, startRow, startCol, targetCh, pairCh, "fw");
}

/** helper for searchPairChar */
function searchPairCharBackward(
    lines: readonly Line[],
    startRow: number,
    startCol: number,
    targetCh: string,
    pairCh: string,
) {
    return searchPairChar(lines, startRow, startCol, targetCh, pairCh, "bw");
}
