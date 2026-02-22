import type { Line } from "./line";

type EditorColors = {
    font: string;
    cursor: string;
    empty: string;
    lineNumber: string;
};

export type EditorConfig = {
    colors: EditorColors;
    fontFamily: string;
    baseFontSize: number;
    lineHeight: number;

    screenrows: number;
    screencols: number;
    lineNumberWidth: number;
};

export type EditorState = {
    row: number; // 現在の行数
    col: number; // 現在の行内の文字数
    px: number; // フォント幅を考慮したピクセル単位のx座標
    rowoff: number; // 縦スクロール時の行のずれ
    pxoff: number; // 横スクロール時のピクセルのずれ
    lines: Line[];
};
