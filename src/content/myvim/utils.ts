const DIGIT = /^[0-9]$/;

export const isDigitChar = (ch: string) => DIGIT.test(ch);

// export function isDigit(text: string): boolean {
//     for (const ch of text) {
//         if (!isDigitChar(ch)) return false;
//     }
//     return true;
// }
