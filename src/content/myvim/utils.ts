const DIGIT = /^[0-9]$/;

export const isDigitChar = (ch: string) => DIGIT.test(ch);

// @ts-expect-error: allow any type
export const isNumber = (value): boolean => {
    return !Number.isNaN(parseInt(value));
};

// export function isDigit(text: string): boolean {
//     for (const ch of text) {
//         if (!isDigitChar(ch)) return false;
//     }
//     return true;
// }
