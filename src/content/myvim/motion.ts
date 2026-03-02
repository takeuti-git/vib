import { isDigitChar } from "./utils";

const FIRST_NON_WHITESPACE = /\S/;

export function vi_getCountMotion(input: string): [number, string | null] {
    if (input[0] === "0") {
        return [1, "0"];
    } else if (!isDigitChar(input[0] as string)) {
        return [1, input];
    }

    let count = "";
    let motion: string | null = null;
    for (let i = 0; i < input.length; i++) {
        count += input[i];

        const nextChar = input[i + 1]
        if (nextChar === undefined) break;

        if (!isDigitChar(nextChar)) {
            motion = input.slice(i + 1);
            break;
        }
    }
    return [Number(count), motion];
}

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
