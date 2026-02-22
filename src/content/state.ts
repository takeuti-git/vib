import { Line } from "./line";

export type EditorState = {
    row: number; // 現在の行数
    col: number; // 現在の行内の文字数
    px: number; // フォント幅を考慮したピクセル単位のx座標
    rowoff: number; // 縦スクロール時の行のずれ
    pxoff: number; // 横スクロール時のピクセルのずれ
    lines: Line[];
};

export function createEditorState(): EditorState {
    return {
        row: 0,
        col: 0,
        px: 0,
        rowoff: 0,
        pxoff: 0,
        lines: [
            new Line()
        ],
    };
}
