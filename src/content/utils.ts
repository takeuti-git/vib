/** 受け取った文字が全角ならtrueを返す */
export function isFullWidth(ch: string): boolean {
    return ch.codePointAt(0)! > 0x7f;
}

export const HALF_WIDTH = 1;
export const FULL_WIDTH = 2;

function getStringWidth(ch: string): number {
    return isFullWidth(ch) ? FULL_WIDTH : HALF_WIDTH;
}

export function calcStringWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += getStringWidth(ch);
    }
    return width;
}

/** 与えられたstringWidthを文字列に対応するcolに変換する */
export function stringWidthToCol(stringWidth: number, text: string): number {
    let width = 0;
    let col = 0;
    for (const ch of text) {
        width += calcStringWidth(ch);
        if (width > stringWidth) break;
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

export function* enumerate<T>(iterable: Iterable<T>): Generator<[T, number]> {
    let i = 0;
    for (const v of iterable) {
        yield [v, i++];
    }
}
