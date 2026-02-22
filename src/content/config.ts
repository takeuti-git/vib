type EditorLines = {
    height: number;
    marginLeft: number;
    relativeNumbers: boolean;
};

type EditorColors = {
    bodyText: string;
    cursorBody: string;
    cursorOutline: string;
    emptyChar: string;
    lineNumber: string;
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
    return {
        screenrows: 10,
        screencols: 40,

        statusBarHeight: 1,

        fontFamily: "Consolas",
        baseFontSize: 16,

        lines: {
            height: 16,
            marginLeft: 5,
            relativeNumbers: true,
        },

        colors: {
            bodyText: "green",
            cursorBody: "#00f5",
            cursorOutline: "#00f",
            emptyChar: "#ccc",
            lineNumber: "#777",
            statusBarBg: "#555",
            statusBarText: "#fff",
        },
    };
}
