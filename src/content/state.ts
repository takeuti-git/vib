import { Line } from "./line";

export type EditorState = {
    row: number; // 現在の行数
    col: number; // 現在の行内の文字数
    px: number; // フォント幅を考慮したピクセル単位のx座標
    logicalWidth: number; // 全角半角を考慮した文字数(半角:1, 全角: 2)
    rowoff: number; // 縦スクロール時の行のずれ
    logicaloff: number;
    lines: Line[];

    vi_mode: "normal" | "insert";
    vi_cmd: string;
    vi_insertBuf: string[];
    vi_insertResolve: (() => void) | null;
};

export function createEditorState(): EditorState {
    return {
        row: 0,
        col: 0,
        px: 0,
        logicalWidth: 0,
        rowoff: 0,
        logicaloff: 0,
        lines: [
            new Line()
        ],

        vi_mode: "normal",
        vi_cmd: "",
        vi_insertBuf: [""],
        vi_insertResolve: null,
    };
}

export function resetState(state: EditorState): void {
    state.row = 0;
    state.col = 0;
    state.px = 0;
    state.logicalWidth = 0;
    state.rowoff = 0;
    state.logicaloff = 0;
    state.lines = [];
    state.vi_mode = "normal";
    state.vi_cmd = "";
}
