import type { EditorConfig } from "./types";

export function createEditorConfig(): EditorConfig {
    return {
        fontFamily: "Consolas",
        baseFontSize: 16,
        lineHeight: 16,
        colors: {
            font: "green",
            cursor: "blue",
            empty: "#ccc",
            lineNumber: "#777",
        },
        screenrows: 10,
        screencols: 40,
        lineNumberWidth: 5,
    };
}
