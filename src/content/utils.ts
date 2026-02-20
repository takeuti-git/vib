import type { EditorConfig } from "./types";

/** 受け取った文字が全角ならtrueを返す */
function isFullWidth(char: string): boolean {
    return /[^\x00-\x7F]/.test(char);
}

export function calcWidth(text: string, config: EditorConfig): number {
    let width = 0;
    for (const ch of text) {
        width += isFullWidth(ch) ? config.baseFontSize : config.baseFontSize / 2;
    }
    return width;
}

/** 与えられたcxを文字数単位に変換する*/
export function cxToCol(cx: number, text: string, config: EditorConfig): number {
    let width = 0;
    let col = 0;
    for (const ch of text) {
        width += calcWidth(ch, config);
        if (width > cx) break;
        col++;
    }
    return col;
}
