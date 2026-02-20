import { Line } from "./line.js";
import type { EditorConfig, EditorState } from "./types";
import { calcWidth, cxToCol } from "./utils.js";

export function render(canvas: HTMLCanvasElement, state: EditorState, config: EditorConfig) {
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    clearCanvas(canvas);
    drawLines(ctx, state, config);
    drawCursor(ctx, state, config);
}

export function clearCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawEmpty(ctx: CanvasRenderingContext2D, x: number, y: number, config: EditorConfig) {
    const radius = config.baseFontSize / 8;
    ctx.fillStyle = "#ccc";
    ctx.beginPath();
    const px = x + config.baseFontSize / 4;
    ctx.arc(px, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
}

function drawChar(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, config: EditorConfig) {
    ctx.fillStyle = config.colors.font;
    ctx.fillText(ch, x, y);
}

function drawLine(ctx: CanvasRenderingContext2D, line: Line, x: number, y: number, state: EditorState, config: EditorConfig) {
    const text = line.text;
    const colStart = cxToCol(state.pxoff, text, config);
    const subPixelOffset = calcWidth(text.slice(0, colStart), config) - state.pxoff;
    let cursorX = x + subPixelOffset;
    const cursorY = y + config.lineHeight / 2;

    const drawingText = text.slice(colStart, colStart + config.screencols);
    for (const ch of drawingText) {
        if (ch === " ") {
            drawEmpty(ctx, cursorX, cursorY, config);
        } else {
            drawChar(ctx, ch, cursorX, cursorY, config);
        }
        cursorX += calcWidth(ch, config);
    }
}

export function drawLines(ctx: CanvasRenderingContext2D, state: EditorState, config: EditorConfig) {
    const px = 0; // 行番号の表示などによって右にずれる可能性
    for (let y = 0; y < config.screenrows; y++) {
        const targetRow = y + state.rowoff;
        const py = y * config.lineHeight;

        if (targetRow < state.lines.length) {
            drawLine(ctx, state.lines[targetRow]!, px, py, state, config);
        } else {
            drawLine(ctx, new Line("~"), px, py, state, config);
        }
    }
}

export function drawCursor(ctx: CanvasRenderingContext2D, state: EditorState, config: EditorConfig) {
    const line = state.lines[state.row] as Line;
    const text = line.text;

    const x = state.px - state.pxoff;
    const y = (state.row - state.rowoff) * config.lineHeight;
    const w = calcWidth(text.slice(state.col, state.col + 1), config);
    const h = config.lineHeight;
    ctx.strokeRect(x, y, w, h);
}
