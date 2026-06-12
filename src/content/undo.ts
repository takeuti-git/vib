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
    const lenBeforeApply = lines.length;
    const firstLineBeforeApply = lines[0];

    const removes = hunk.lines.filter(l => l[0] === "-");
    const inserts = hunk.lines.filter(l => l[0] === "+");
    const cursor  = hunk.oldStart - 1;

    lines.splice(cursor, removes.length);
    lines.splice(cursor, 0, ...inserts.map(l => new Line(l.slice(1))));

    // 空の状態からredoした際に1行増えてしまうため、末尾のLineを削除する。
    // state.linesはカーソル表示用に常に1行分を確保するため
    if (firstLineBeforeApply?.isEmpty() && lenBeforeApply === 1) {
        lines.pop();
    }
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

export function saveDiff(
    state: Pick<EditorState, "cursor" | "diff">,
    oldText: string,
    newText: string
): boolean {
    if (state.diff.disableSave) {
        state.diff.disableSave = false;
        return false;
    }

    if (oldText === newText) {
        return false;
    }

    const element: DiffStackElement = {
        position: { row: state.cursor.row, col: state.cursor.col },
        hunks: createDiffHunks(oldText, newText),
    };
    state.diff.stack[state.diff.stackPtr] = element;

    state.diff.lastSnapshot = newText;
    state.diff.stackPtr++;
    state.diff.stack.length = state.diff.stackPtr; // ptr以降の要素を切り捨て, undo後に編集すると以降の履歴を削除する
    return true;
}

export function undo(state: Pick<EditorState, "lines" | "diff">): Position | undefined {
    if (state.diff.stackPtr === 0) return;

    state.diff.stackPtr--;

    const element = state.diff.stack[state.diff.stackPtr];
    if (!element) throw new Error("diff.stack element is undefined");
    revertPatch(state.lines, element.hunks);

    state.diff.lastSnapshot = joinLines(state.lines);

    if (state.lines.length === 0) {
        state.lines.push(new Line());
        return { row: 0, col: 0 };
    }

    return element.position;
}

export function redo(state: Pick<EditorState, "lines" | "diff">): Position | undefined {
    if (state.diff.stackPtr === state.diff.stack.length) return;

    const element = state.diff.stack[state.diff.stackPtr];
    if (!element) throw new Error("diff.stack element is undefined");
    applyPatch(state.lines, element.hunks);

    state.diff.lastSnapshot = joinLines(state.lines);
    state.diff.stackPtr++;
    return element.position;
}
