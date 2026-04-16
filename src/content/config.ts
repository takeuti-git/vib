type Whitespace = "none" | "all";
type LineNumberMode = "off" | "absolute" | "relative";
type HexColor = `#${string}`;

type EditorColors = {
    text: {
        normal: HexColor;
        whitespace: HexColor;
    };
    cursor: {
        body: HexColor;
        outline: HexColor;
    };
    lineNumber: {
        normal: HexColor;
        current: HexColor;
    };
    statusBar: {
        bg: HexColor;
        text: HexColor;
    };
};

export type EditorConfig = {
    screenrows: number;
    screencols: number;

    statusBarHeight: number;

    tabstop: number; // >=1
    autoIndent: boolean;

    lineNumbers: LineNumberMode;
    lineNumberCols: number;

    renderWhitespace: Whitespace;

    fontFamily: string;

    baseFontSize: number;
    lineHeightPadding: number;

    colors: EditorColors;
};

export function createEditorConfig(): EditorConfig {
    return {
        screenrows: 10,
        screencols: 40,

        statusBarHeight: 1,

        tabstop: 4,
        autoIndent: true,

        lineNumbers: "relative",
        lineNumberCols: 5,

        renderWhitespace: "all",

        fontFamily: "Consolas",
        baseFontSize: 16,
        lineHeightPadding: 2,

        colors: {
            text: {
                normal: "#008000",
                whitespace: "#ccc",
            },
            cursor: {
                body: "#00f8",
                outline: "#00f",
            },
            lineNumber: {
                normal: "#777",
                current: "#ff8c00",
            },
            statusBar: {
                bg: "#555",
                text: "#fff",
            },
        },
    };
}

export function getHalfScreenRows(config: Readonly<EditorConfig>): number {
    return Math.max(1, config.screenrows / 2 - config.statusBarHeight);
}

export function getFullScreenRows(config: Readonly<EditorConfig>): number {
    return config.screenrows - config.statusBarHeight;
}
