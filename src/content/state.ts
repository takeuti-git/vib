import { Line } from "./line";
import type { FindCommandName } from "./myvim/findCommand";

export type EditorState = {
    row: number; // 現在の行数
    col: number; // 現在の行内の文字数
    px: number; // フォント幅を考慮したピクセル単位のx座標
    logicalWidth: number; // 全角半角を考慮した文字数(半角:1, 全角: 2)
    preferredWidth: number; // 最後に左右移動した値の保持
    rowoff: number; // 縦スクロール時の行のずれ
    logicaloff: number;
    lines: Line[];
    lastSnapshot: string;
    diffStack: string[];
    stackPtr: number;
    diffDirty: boolean;

    vi_mode: "normal" | "insert" | "replace";
    vi_cmd: string[];
    vi_lastCmd: string[];
    vi_insertBuf: string[];
    vi_insertResolve: (() => void) | null;
    vi_yankLinewise: boolean;
    vi_cursor: "full" | "under" | "vertical";
    vi_lastFindMotion: { name: FindCommandName; arg: string } | null;
};

export function createEditorState(): EditorState {
    return {
        row: 0,
        col: 0,
        px: 0,
        logicalWidth: 0,
        preferredWidth: 0,
        rowoff: 0,
        logicaloff: 0,
        lines: [new Line()],
        lastSnapshot: "",
        diffStack: [],
        stackPtr: 0,
        diffDirty: false,

        vi_mode: "normal",
        vi_cmd: [],
        vi_lastCmd: [],
        vi_insertBuf: [""],
        vi_insertResolve: null,
        vi_yankLinewise: false,
        vi_cursor: "full",
        vi_lastFindMotion: null,
    };
}

export function resetState(state: EditorState): void {
    state.row = 0;
    state.col = 0;
    state.px = 0;
    state.logicalWidth = 0;
    state.rowoff = 0;
    state.logicaloff = 0;
    state.lines = [new Line()];
    state.lastSnapshot = "";
    state.diffStack = [];
    state.stackPtr = 0;
    state.diffDirty = false;
    state.vi_mode = "normal";
    state.vi_cmd = [];
    state.vi_lastCmd = [];
    state.vi_insertBuf = [];
    state.vi_insertResolve = null;
    state.vi_yankLinewise = false;
    state.vi_cursor = "full";
    state.vi_lastFindMotion = null;
}
