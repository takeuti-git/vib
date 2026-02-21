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
        },
        screenrows: 10,
        screencols: 40,
    };
}
