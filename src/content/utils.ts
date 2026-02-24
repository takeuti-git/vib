/** 受け取った文字が全角ならtrueを返す */
export function isFullWidth(char: string): boolean {
    return /[^\x00-\x7F]/.test(char);
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

