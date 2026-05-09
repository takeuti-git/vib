import { structuredPatch } from "diff";
import type { DiffStackElement, Hunk } from "./types/patch";
import { joinLines, Line } from "./line";
import type { Position } from "./types/motion";
import type { EditorState } from "./state";

export function createDiffHunks(oldText: string, newText: string): Hunk[] {
    const patch = structuredPatch(
        "oldFileName", "newFileName",
        oldText, newText,
        undefined, undefined,
        { context: 0 }
    );
    return patch.hunks;
}

function applyHunk(lines: Line[], hunk: Hunk): void {
    const removes = hunk.lines.filter(l => l[0] === "-");
    const inserts = hunk.lines.filter(l => l[0] === "+");
    const cursor  = hunk.oldStart - 1;

    lines.splice(cursor, removes.length);
    lines.splice(cursor, 0, ...inserts.map(l => new Line(l.slice(1))));
}

function revertHunk(lines: Line[], hunk: Hunk): void {
    const removes = hunk.lines.filter(l => l[0] === "+");
    const inserts = hunk.lines.filter(l => l[0] === "-");
    const cursor  = hunk.newStart - 1;

    lines.splice(cursor, removes.length);
    lines.splice(cursor, 0, ...inserts.map(l => new Line(l.slice(1))));
}

function applyPatch(lines: Line[], hunks: Hunk[]): void {
    for (let i = hunks.length - 1; i >= 0; i--) {
        applyHunk(lines, hunks[i]!);
    }
}

function revertPatch(lines: Line[], hunks: Hunk[]): void {
    for (let i = hunks.length - 1; i >= 0; i--) {
        revertHunk(lines, hunks[i]!);
    }
}

export function saveDiff(state: EditorState, oldText: string, newText: string): void {
    if (state.disableSaveDiff) {
        state.disableSaveDiff = false;
        return;
    }

    if (oldText === newText) {
        return;
    }

    const element: DiffStackElement = {
        position: { row: state.row, col: state.col },
        hunks: createDiffHunks(oldText, newText),
    };
    state.diffStack[state.diffStackPtr] = element;

    state.lastSnapshot = newText;
    state.diffStackPtr++;
    state.diffStack.length = state.diffStackPtr; // ptr以降の要素を切り捨て, undo後に編集すると以降の履歴を削除する
}

export function undo(state: EditorState): Position | undefined {
    if (state.diffStackPtr === 0) return;

    state.diffStackPtr--;

    const element = state.diffStack[state.diffStackPtr]!;
    revertPatch(state.lines, element.hunks);

    state.lastSnapshot = joinLines(state.lines);

    if (state.lines.length === 0) {
        state.lines.push(new Line());
        return { row: 0, col: 0 };
    }

    return element.position;
}

export function redo(state: EditorState): Position | undefined {
    if (state.diffStackPtr === state.diffStack.length) return;

    const element = state.diffStack[state.diffStackPtr]!;
    applyPatch(state.lines, element.hunks);

    state.lastSnapshot = joinLines(state.lines);
    state.diffStackPtr++;
    return element.position;
}
