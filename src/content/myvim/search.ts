import type { Line } from "../line";
import { enumerate } from "../utils";

// TODO: 大文字小文字の区別のオプション化(smartcase)
// TODO: 検索行の順序変更('/' | '?')

export function searchKeyword(
    startRow: number,
    startCol: number,
    lines: Line[],
    keyword: string
): { row: number, col: number }[] {
    const withIndex = [...enumerate(lines)];
    const sortedLines = withIndex.slice(startRow).concat(withIndex.slice(0, startRow));
    const regex = new RegExp(keyword, "g");
    const result = [];

    for (const [ln, i] of sortedLines) {
        const matches = [...ln.text.matchAll(regex)];
        for (const m of matches) {
            result.push({ row: i, col: m.index });
        }
    }
    console.log(result);
    return result;
}
