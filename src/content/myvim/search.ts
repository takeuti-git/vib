import type { Line } from "../line";
import type { Position } from "../types/motion";
import { enumerate } from "../utils";

type SearchOptions = {
    ignorecase: boolean;
    smartcase: boolean;
};

type PositionWithLength = Position & { length: number; };

export function searchKeyword(
    lines: Readonly<Line[]>,
    keyword: string,
    { ignorecase = false, smartcase = false }: Partial<SearchOptions>,
): PositionWithLength[] {
    const flags = (
        (smartcase && ignorecase) ? (
            (keyword.toLowerCase() === keyword) ? "gi" : "g"
        ) : (ignorecase) ? "gi" : "g"
    );
    const regex = new RegExp(keyword, flags);
    const result: PositionWithLength[] = [];

    for (const [line, i] of enumerate(lines)) {
        const matches = [...line.text.matchAll(regex)];
        for (const m of matches) {
            result.push({ row: i, col: m.index, length: m[0].length });
        }
    }
    return result;
}

export function getClosestPos(
    positions: Position[],
    row: number,
    col: number,
    dir: 0 | 1,
): { position: Position; index: number; } {
    if (dir === 0) {
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i]!;
            if ((p.row > row) || (p.row === row && p.col > col)) {
                return { position: p, index: i };
            }
        }
        return { position: positions[0]!, index: 0 }; // 最後の要素から折り返したとき、最初の要素にもどって来る
    } else {
        for (let i = positions.length - 1; i >= 0; i--) {
            const p = positions[i]!;
            if ((p.row < row) || (p.row === row && p.col < col)) {
                return { position: p, index: i };
            }
        }
        const lastIndex = positions.length - 1;
        return { position: positions[lastIndex]!, index: lastIndex }; // 最後の要素から折り返したとき、最後の要素が結果になる
    }
}
