import type { Line } from "../line";
import type { Position } from "../types/motion";
import { enumerate } from "../utils";

// TODO: 大文字小文字の区別のオプション化(smartcase)

function searchKeyword(lines: Readonly<Line[]>, keyword: string): Position[] {
    const regex = new RegExp(keyword, "g");
    const result: Position[] = [];

    for (const [line, i] of enumerate(lines)) {
        const matches = [...line.text.matchAll(regex)];
        for (const m of matches) {
            result.push({ row: i, col: m.index });
        }
    }
    return result;
}

export function getNextKeywordPos(
    row: number,
    col: number,
    lines: Readonly<Line[]>,
    keyword: string,
): Position | undefined {
    const results = searchKeyword(lines, keyword);
    if (results.length === 0) return undefined;

    for (const p of results) {
        if ((p.row > row) || (p.row === row && p.col > col)) {
            return p;
        }
    }
    return results[0]; // 最後の要素から折り返したとき、最初の要素にもどって来る
}

export function getPrevKeywordPos(
    row: number,
    col: number,
    lines: Readonly<Line[]>,
    keyword: string,
): Position | undefined {
    const results = searchKeyword(lines, keyword);
    if (results.length === 0) return undefined;

    for (let i = results.length - 1; i >= 0; i--) {
        const p = results[i]!;
        if ((p.row < row) || (p.row === row && p.col < col)) {
            return p;
        }
    }
    return results[results.length - 1]; // 最後の要素から折り返したとき、最後の要素が結果になる
}
