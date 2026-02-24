import type { EditorConfig } from "./config";
import type { EditorState } from "./state";
import type { Line } from "./line";
import { isFullWidth, logicalWidthToCol } from "./utils";

type DrawingOptions = {
    stroke: boolean;
    fill: boolean;
};

type SquareContext = {
    connectLeft: boolean;
    connectRight: boolean;
};

export class Renderer {
    private readonly config: EditorConfig;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

    constructor(config: EditorConfig, canvas: HTMLCanvasElement) {
        this.config = config;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    }

    // ------------------------------
    // | public methods
    // ------------------------------

    public applyConfig(): void {
        const width = this.config.screencols * this.halfFontSize;
        const height = this.config.screenrows * this.config.lines.height;

        // CSSの設定
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        // 物理的な画素数とCSSの論理的な画素数の比を使って正確なピクセル数を求める
        const dpr = window.devicePixelRatio;
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
        console.log(this.canvas.width, this.canvas.height);

        // ctx.setTransformはプロパティをリセットする
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.font = `${this.config.baseFontSize}px ${this.config.fontFamily}`;
        this.ctx.textBaseline = "middle";
    }

    public render(state: EditorState): void {
        this.clear();
        this.drawLines(state);
        this.drawCursor(state);
        this.drawStatusBar(state);
    }

    // ------------------------------
    // | rendering methods
    // ------------------------------

    private clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private drawLines(state: EditorState): void {
        const px = this.lineNumberMargin;

        const number = this.config.lines.number;
        const relativenumber = this.config.lines.relativeNumbers;
        for (let y = 0; y < this.config.screenrows - this.config.statusBarHeight; y++) {
            const targetRow = y + state.rowoff;
            const py = y * this.config.lines.height + this.halfLineHeight;

            const line = state.lines[targetRow];
            if (!line) return;

            this.drawLineText(state, px, py, line.text);

            if (!number) continue;

            const isCurrentRow = state.row === targetRow;
            const absRowNumber = targetRow + 1;

            const rowDisplayNumber = (relativenumber)
                ? (isCurrentRow)
                    ? absRowNumber
                    : Math.abs(state.row - targetRow)
                : absRowNumber
            this.drawLineNumber(state, px, py, targetRow, rowDisplayNumber);
        }
    }

    private drawCursor(state: EditorState): void {
        const currLine = state.lines[state.row] as Line;
        const text = currLine.text;

        const x = ((state.logicalWidth - state.logicaloff) * this.halfFontSize)
                   + this.lineNumberMargin;
        const y = (state.row - state.rowoff) * this.config.lines.height;
        const w = this.calcWidth(text[state.col] ?? "");
        const h = this.config.lines.height;
        this.ctx.fillStyle = this.config.colors.cursorBody;
        this.ctx.strokeStyle = this.config.colors.cursorOutline;
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeRect(x, y, w, h);
    }

    private drawStatusBar(state: EditorState): void {
        const statusBarHeight = this.config.statusBarHeight;
        const y = (this.config.screenrows - statusBarHeight)
                   * this.config.lines.height;
        const w = this.config.screencols * this.halfFontSize;
        const h = statusBarHeight * this.config.lines.height;
        this.ctx.fillStyle = this.config.colors.statusBarBg;
        this.ctx.fillRect(0, y, w, h);

        const x = w; // ウィンドウの右端から左方向に描く
        const rowcol = `${state.row + 1},${state.col + 1}`;
        this.ctx.fillStyle = this.config.colors.statusBarText;
        this.ctx.textAlign = "right";
        this.ctx.fillText(rowcol, x, y + this.halfLineHeight);
    }

    private drawLineNumber(
        state: EditorState,
        x: number,
        y: number,
        row: number,
        lineNum: number
    ): void {
        this.ctx.fillStyle = (row === state.row)
            ? this.config.colors.lineNumberCurrent
            : this.config.colors.lineNumber;
        this.ctx.textAlign = "right";
        // 行番号の右側に空白1つ分開ける: x - halfFontsize
        this.ctx.fillText(lineNum.toString(), x - this.halfFontSize, y);
    }

    private drawLineText(
        state: EditorState,
        x: number,
        y: number,
        text: string
    ): void {
        this.ctx.textAlign = "start";
        const startCol = logicalWidthToCol(state.logicaloff, text);
        const subPixelOffset = (
            this.calcWidth(text.slice(0, startCol))
            - (state.logicaloff * this.halfFontSize)
        );
        let cursorX = x + subPixelOffset;

        const drawingText = text.slice(
            startCol,
            startCol + this.config.screencols - this.lineNumberCols
        );
        Array.from(drawingText).forEach((ch, i) => {
            if (ch === " " /* half width space */) {
                this.drawEmptyHalfWidth(cursorX, y);
            } else if (ch === "　" /* full width space */) {
                this.drawEmptyFullWidth(cursorX, y, drawingText, i);
            } else {
                this.drawChar(cursorX, y, ch);
            }
            cursorX += this.calcWidth(ch);
        });
    }

    private drawChar(x: number, y: number, ch: string): void {
        this.ctx.fillStyle = this.config.colors.bodyText;
        this.ctx.fillText(ch, x, y);
    }

    private drawEmptyHalfWidth(x: number, y: number): void {
        const radius = this.config.baseFontSize / 8;
        const px = x + this.config.baseFontSize / 4;
        this.drawEmptyCircle(px, y, radius);
    }

    private drawEmptyFullWidth(
        x: number,
        y: number,
        text: string,
        col: number
    ): void {
        const adjustedY = y - this.halfFontSize;
        const size = this.config.baseFontSize;

        const leftChar = text[col - 1];
        const currChar = text[col];
        const rightChar = text[col + 1];
        const context: SquareContext = {
            connectLeft: currChar === leftChar,
            connectRight: currChar === rightChar,
        };
        this.drawEmptySquare(x, adjustedY, size, context);
    }

    // ------------------------------
    // | rendering helpers
    // ------------------------------

    private drawEmptyCircle(
        x: number,
        y: number,
        radius: number,
        opts: Partial<DrawingOptions> = {}
    ): void {
        const options: DrawingOptions = {
            stroke: false,
            fill: true,
            ...opts
        };

        this.ctx.strokeStyle = this.config.colors.emptyChar;
        this.ctx.fillStyle = this.config.colors.emptyChar;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.closePath();

        if (options.stroke) this.ctx.stroke();
        if (options.fill) this.ctx.fill();
    }

    private drawEmptySquare(
        x: number,
        y: number,
        size: number,
        context: SquareContext,
        opts: Partial<DrawingOptions> = {}
    ): void {
        const options: DrawingOptions = {
            stroke: true,
            fill: false,
            ...opts
        };

        this.ctx.strokeStyle = this.config.colors.emptyChar;
        this.ctx.fillStyle = this.config.colors.emptyChar;

        if (options.fill) {
            this.ctx.fillRect(x, y, size, size);
        }
        else if (options.stroke) {
            const topLeft = { x, y };
            const topRight = { x: x + size, y };
            const bottomLeft = { x, y: y + size };
            const bottomRight = { x: x + size, y: y + size };

            // top
            this.drawStraightLine(topLeft, topRight);

            // bottom
            this.drawStraightLine(bottomLeft, bottomRight);

            // left
            if (!context.connectLeft) {
                this.drawStraightLine(topLeft, bottomLeft);
            }

            // right
            if (!context.connectRight) {
                this.drawStraightLine(topRight, bottomRight);
            }
        }
    }

    private drawStraightLine(
        start: { x: number, y: number },
        end: { x: number, y: number }
    ): void {
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.closePath();
        this.ctx.stroke();
    }

    // ------------------------------
    // | calculation helpers
    // ------------------------------

    private get lineNumberMargin(): number {
        return (this.config.lines.number)
            ? this.config.lines.lineNumberCols * this.halfFontSize
            : 0;
    }

    private get lineNumberCols(): number {
        return (this.config.lines.number)
            ? this.config.lines.lineNumberCols
            : 0;
    }

    private get halfLineHeight(): number {
        return this.config.lines.height / 2;
    }

    private get halfFontSize(): number {
        return this.config.baseFontSize / 2;
    }

    private calcWidth(text: string): number {
        let width = 0;
        for (const ch of text) {
            width += isFullWidth(ch)
                ? this.config.baseFontSize
                : this.halfFontSize;
        }
        return width;
    }
}
