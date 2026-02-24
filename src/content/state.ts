import { Line } from "./line";

export type EditorState = {
    row: number; // 現在の行数
    col: number; // 現在の行内の文字数
    px: number; // フォント幅を考慮したピクセル単位のx座標
    logicalWidth: number; // 全角半角を考慮した文字数(半角:1, 全角: 2)
    rowoff: number; // 縦スクロール時の行のずれ
    logicaloff: number;
    lines: Line[];
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
    };
}
