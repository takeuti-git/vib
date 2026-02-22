type EditorLines = {
    height: number;
    marginLeft: number;
    relativeNumbers: boolean;
};

type EditorColors = {
    font: string;
    cursor: string;
    empty: string;
    lineNumber: string;
};

export type EditorConfig = {
    screenrows: number;
    screencols: number;

    fontFamily: string;
    baseFontSize: number;

    lines: EditorLines;
    colors: EditorColors;
};

export function createEditorConfig(): EditorConfig {
    return {
        screenrows: 10,
        screencols: 40,

        fontFamily: "Consolas",
        baseFontSize: 16,

        lines: {
            height: 16,
            marginLeft: 5,
            relativeNumbers: true,
        },

        colors: {
            font: "green",
            cursor: "blue",
            empty: "#ccc",
            lineNumber: "#777",
        },
    };
}
