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
