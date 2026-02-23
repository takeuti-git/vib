type EditorLines = {
    height: number;
    number: boolean;
    lineNumberCols: number;
    relativeNumbers: boolean;
};

type EditorColors = {
    bodyText: string;
    cursorBody: string;
    cursorOutline: string;
    emptyChar: string;
    lineNumber: string;
    lineNumberCurrent: string;
    statusBarBg: string;
    statusBarText: string;
};

export type EditorConfig = {
    screenrows: number;
    screencols: number;

    statusBarHeight: number;

    fontFamily: string;
    baseFontSize: number;

    lines: EditorLines;
    colors: EditorColors;
};

export function createEditorConfig(): EditorConfig {
    const height = 16;
    return {
        screenrows: 10,
        screencols: 40,

        statusBarHeight: 1,

        fontFamily: "Consolas",
        baseFontSize: height,

        lines: {
            height: height + 2, // cannot be smaller than baseFontSize
            number: true,
            lineNumberCols: 5,
            relativeNumbers: true,
        },

        colors: {
            bodyText: "green",
            cursorBody: "#00f5",
            cursorOutline: "#00f",
            emptyChar: "#ccc",
            lineNumber: "#777",
            lineNumberCurrent: "#ff8c00",
            statusBarBg: "#555",
            statusBarText: "#fff",
        },
    };
}
