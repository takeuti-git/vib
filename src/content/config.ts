import type { EditorConfig } from "./types";

export function initEditorConfig(): EditorConfig {
    return {
        fontFamily: "Consolas",
        baseFontSize: 16,
        lineHeight: 16,
        colors: {
            font: "green",
            cursor: "blue"
        },
        screenrows: 10,
        screencols: 40,
    };
}

export function initConfig(canvas: HTMLCanvasElement, config: EditorConfig) {
    applyConfig(config, canvas);
    canvas.tabIndex = -1;
    canvas.style.outline = "none";

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.textBaseline = "middle";
}

function applyConfig(config: EditorConfig, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    canvas.width = config.screencols * (config.baseFontSize / 2);
    canvas.height = config.screenrows * config.lineHeight;
    ctx.font = `${config.baseFontSize}px ${config.fontFamily}`;
    ctx.fillStyle = config.colors.font;
    ctx.strokeStyle = config.colors.cursor;
}
