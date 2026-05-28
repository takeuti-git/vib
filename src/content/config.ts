type Whitespace = "none" | "all";
type LineNumberMode = "off" | "absolute" | "relative";
type HexColor = `#${string}`;

type EditorColors = {
    background: {
        main: HexColor;
        statusBar: HexColor;
    },
    text: {
        normal: HexColor;
        whitespace: HexColor;
        statusBar: HexColor;
    };
    cursor: {
        body: HexColor;
    };
    lineNumber: {
        normal: HexColor;
        current: HexColor;
    };
};

export type EditorConfig = {
    screenrows: number;
    screencols: number;

    statusBarHeight: number;

    tabstop: number; // >=1
    autoIndent: boolean;

    lineNumbers: LineNumberMode;
    minLineNumberCols: number;

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
        minLineNumberCols: 0,

        renderWhitespace: "all",

        fontFamily: "Consolas",
        baseFontSize: 16,
        lineHeightPadding: 2,

        colors: {
            background: {
                main: "#eee",
                statusBar: "#555",
            },
            text: {
                normal: "#008000",
                whitespace: "#ccc",
                statusBar: "#fff",
            },
            cursor: {
                body: "#00f8",
            },
            lineNumber: {
                normal: "#777",
                current: "#ff8c00",
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

export function getHalfScreenCols(config: Readonly<EditorConfig>): number {
    return Math.max(1, config.screencols / 2);
}
