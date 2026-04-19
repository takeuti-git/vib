/** 受け取った文字が全角ならtrueを返す */
export function isFullWidth(ch: string): boolean {
    return ch.codePointAt(0)! > 0x7f;
}

export const LOGICAL_HALF_WIDTH = 1;
export const LOGICAL_FULL_WIDTH = 2;

function getLogicalWidth(ch: string): number {
    return isFullWidth(ch) ? LOGICAL_FULL_WIDTH : LOGICAL_HALF_WIDTH;
}

export function calcLogicalWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += getLogicalWidth(ch);
    }
    return width;
}

/** 与えられたlogicalWidthを文字列に対応するcolに変換する */
export function logicalWidthToCol(logicalWidth: number, text: string): number {
    let width = 0;
    let col = 0;
    for (const ch of text) {
        width += calcLogicalWidth(ch);
        if (width > logicalWidth) break;
        col++;
    }
    return col;
}

/** 文字列の先頭から半角の空白文字数を計算する。見つからない場合は0を返す */
export function getCountUntilNonWhitespace(text: string): number {
    let count = 0;
    for (const ch of text) {
        if (ch !== " ") {
            break;
        }
        count++;
    }
    return count;
}

export function removeFirstWhitespace(text: string, count = 1): string {
    let i = 0;
    for (; i < text.length; i++) {
        if (text[i] === " " && i < count) {
            continue;
        }
        break;
    }
    return text.slice(i);
}

export function addFirstWhitespace(text: string, count = 1): string {
    return " ".repeat(count) + text;
}
