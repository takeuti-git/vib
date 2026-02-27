const FIRST_NON_WHITESPACE = /\S/;
const DIGIT = /^[0-9]$/;

function isDigit(text: string): boolean {
    for (const ch of text) {
        if (!DIGIT.test(ch)) return false;
    }
    return true;
}

export function vi_getCountMotion(input: string): [number, string | null] {
    if (input[0] === "0") {
        return [1, "0"];
    } else if (!isDigit(input[0] as string)) {
        return [1, input];
    }

    let count = "";
    let motion: string | null = null;
    for (let i = 0; i < input.length; i++) {
        count += input[i];

        const nextChar = input[i + 1]
        if (nextChar === undefined) break;

        if (!isDigit(nextChar)) {
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
