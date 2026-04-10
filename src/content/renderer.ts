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

const STATUS_MSG_X = 120;

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
        const height = this.config.screenrows * this.lineHeight;

        // CSSの設定
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        // 物理的な画素数とCSSの論理的な画素数の比を使って正確なピクセル数を求める
        const dpr = window.devicePixelRatio;
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);

        // ctx.setTransformはプロパティをリセットするため、font等を再設定する
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.font = `${this.config.baseFontSize}px "${this.config.fontFamily}", monospace`;
        this.ctx.textBaseline = "middle";
    }

    public render(state: EditorState): void {
        this.clear();
        this.drawLines(state);
        this.drawCursor(state);
        this.drawStatusBar(state, state.vi_cmd.join(""));
        this.adjustLineNumberMargin();
    }

    public setStatusMsg(state: EditorState, text: string) {
        this.drawStatusBar(state, text);
    }

    // ------------------------------
    // | rendering methods
    // ------------------------------

    private clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private drawLines(state: EditorState): void {
        const px = this.lineNumberMargin;

        const isLineNumberOn = this.config.lineNumbers !== "off";
        const isRelative = this.config.lineNumbers === "relative";
        for (let y = 0; y < this.config.screenrows - this.config.statusBarHeight; y++) {
            const targetRow = y + state.rowoff;
            const py = y * this.lineHeight + this.halfLineHeight;

            const line = state.lines[targetRow];
            if (!line) {
                this.drawNonLine(py);
                continue;
            }

            this.drawLineText(state, targetRow, px, py, line.text);

            if (!isLineNumberOn) continue;

            const isCurrentRow = state.row === targetRow;
            const absoluteRowNumber = targetRow + 1;

            const rowDisplayNumber = isRelative
                ? isCurrentRow
                    ? absoluteRowNumber
                    : Math.abs(state.row - targetRow)
                : absoluteRowNumber;
            this.drawLineNumber(state, px, py, targetRow, rowDisplayNumber);
        }
    }

    private drawCursor(state: EditorState): void {
        const currLine = state.lines[state.row] as Line;
        const text = currLine.text;
        const lineheight = this.lineHeight;
        const x =
            (state.logicalWidth - state.logicaloff) * this.halfFontSize + this.lineNumberMargin;
        const y = (state.row - state.rowoff) * lineheight;
        const ch = text[state.col];

        this.drawCursorAt(state, x, y, ch);
    }

    private drawCursorAt(state: EditorState, x: number, y: number, ch?: string): void {
        if (!ch) ch = " ";
        else if (ch.length > 1) throw new Error("ch must be a char or empty char");

        const isUnder = state.cursorStyle === "under";
        const isVertical = state.cursorStyle === "vertical";

        const y_ = isUnder ? y + this.lineHeight : y;
        const w = isVertical ? 1 : this.calcWidth(ch);
        const h = isUnder ? 1 : this.lineHeight;

        this.ctx.fillStyle = this.config.colors.cursor.body;
        this.ctx.fillRect(x, y_, w, h);
        // // stroke付きだと範囲選択時に枠線だらけで見づらいため無効化
        // this.ctx.strokeStyle = this.config.colors.cursor.outline;
        // this.ctx.strokeRect(x, y_, w, h);
    }

    private drawStatusBar(state: EditorState, text: string): void {
        this.drawStatusBarBg();

        const vi_mode = "-- " + state.vi_state.mode.toUpperCase() + " --";
        this.drawStatusBarText(0, vi_mode);

        this.drawStatusBarText(STATUS_MSG_X, text);

        this.drawStatusBarRC(state.row, state.col, state.logicalWidth);
    }

    private get bottomTextY(): number {
        return (this.config.screenrows - 1) * this.lineHeight + this.halfLineHeight;
    }

    private drawStatusBarBg(): void {
        const lineHeight = this.lineHeight;
        const statusBarHeight = this.config.statusBarHeight;
        const y = (this.config.screenrows - statusBarHeight) * lineHeight;
        const w = this.config.screencols * this.halfFontSize;
        const h = statusBarHeight * this.lineHeight;
        this.ctx.fillStyle = this.config.colors.statusBar.bg;
        // 背景の矩形を描く
        this.ctx.fillRect(0, y, w, h);
    }

    private drawStatusBarText(x: number, text: string): void {
        this.ctx.fillStyle = this.config.colors.statusBar.text;
        this.ctx.textAlign = "start";
        this.ctx.fillText(text, x, this.bottomTextY);
    }

    /** draw row/col in the status bar */
    private drawStatusBarRC(row: number, col: number, width: number): void {
        this.ctx.fillStyle = this.config.colors.statusBar.text;
        this.ctx.textAlign = "right";
        const x = this.config.screencols * this.halfFontSize;
        const rc = `${row + 1},${col + 1}(${width})`;
        this.ctx.fillText(rc, x, this.bottomTextY);
        this.ctx.textAlign = "start"; // 元に戻す
    }

    private adjustLineNumberMargin() {
        // 行番号右の余白にlineTextがはみ出て描写されるのを消去する
        const x = this.config.lineNumberCols * this.halfFontSize - 1;
        const w = -this.halfFontSize;
        const h = (this.config.screenrows - this.config.statusBarHeight) * this.lineHeight;
        this.ctx.clearRect(x, 0, w, h);
    }

    private drawLineNumber(
        state: EditorState,
        x: number,
        y: number,
        row: number,
        lineNum: number,
    ): void {
        this.ctx.fillStyle =
            row === state.row
                ? this.config.colors.lineNumber.current
                : this.config.colors.lineNumber.normal;
        this.ctx.textAlign = "right";
        // 行番号の右側に空白1つ分開ける: x - halfFontsize
        this.ctx.fillText(lineNum.toString(), x - this.halfFontSize, y);
        this.ctx.textAlign = "start"; // 元に戻す
    }

    private drawLineText(
        state: EditorState,
        lineNumber: number,
        x: number,
        y: number,
        text: string
    ): void {
        this.ctx.textAlign = "start";
        const startCol = logicalWidthToCol(state.logicaloff, text);
        const subPixelOffset =
            this.calcWidth(text.slice(0, startCol)) - state.logicaloff * this.halfFontSize;
        let cursorX = x + subPixelOffset;

        const slicedText = text.slice(
            startCol,
            startCol + this.config.screencols - this.lineNumberCols,
        );
        const isVisualMode = state.vi_state.mode === "visual";

        if (isVisualMode && slicedText === "" && this.inVisualRange(state, lineNumber, startCol)) {
            this.drawCursorAt(state, this.lineNumberMargin, y - this.halfLineHeight);
        } else {
            Array.from(slicedText).forEach((ch, i) => {
                this.drawChar(cursorX, y, ch);

                if (this.config.renderWhitespace === "all") {
                    if (ch === " " /* half width whitespace */) {
                        this.drawEmptyHalfWidth(cursorX, y);
                    } else if (ch === "　" /* full width whitespace */) {
                        this.drawEmptyFullWidth(cursorX, y, slicedText, i);
                    }
                }
                if (isVisualMode && this.inVisualRange(state, lineNumber, i + startCol)) {
                    this.drawCursorAt(state, cursorX, y - this.halfLineHeight, ch);
                }
                cursorX += this.calcWidth(ch);
            });
        }
    }

    private drawNonLine(y: number) {
        this.ctx.fillStyle = this.config.colors.lineNumber.normal;
        this.ctx.fillText("~", 0, y);
    }

    private drawChar(x: number, y: number, ch: string): void {
        this.ctx.fillStyle = this.config.colors.text.normal;
        this.ctx.fillText(ch, x, y);
    }

    private drawEmptyHalfWidth(x: number, y: number): void {
        const radius = this.config.baseFontSize / 8;
        const px = x + this.config.baseFontSize / 4;
        this.drawEmptyCircle(px, y, radius);
    }

    private drawEmptyFullWidth(x: number, y: number, text: string, col: number): void {
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
        opts: Partial<DrawingOptions> = {},
    ): void {
        const options: DrawingOptions = {
            stroke: false,
            fill: true,
            ...opts,
        };

        this.ctx.strokeStyle = this.config.colors.text.whitespace;
        this.ctx.fillStyle = this.config.colors.text.whitespace;
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
        opts: Partial<DrawingOptions> = {},
    ): void {
        const options: DrawingOptions = {
            stroke: true,
            fill: false,
            ...opts,
        };

        this.ctx.strokeStyle = this.config.colors.text.whitespace;
        this.ctx.fillStyle = this.config.colors.text.whitespace;

        if (options.fill) {
            this.ctx.fillRect(x, y, size, size);
        } else if (options.stroke) {
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

    private drawStraightLine(start: { x: number; y: number }, end: { x: number; y: number }): void {
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
        return this.config.lineNumbers !== "off"
            ? this.config.lineNumberCols * this.halfFontSize
            : 0;
    }

    private get lineNumberCols(): number {
        return this.config.lineNumbers !== "off" ? this.config.lineNumberCols : 0;
    }

    private get lineHeight(): number {
        return this.config.baseFontSize + this.config.lineHeightPadding;
    }

    private get halfLineHeight(): number {
        return this.lineHeight / 2;
    }

    private get halfFontSize(): number {
        return this.config.baseFontSize / 2;
    }

    private calcWidth(text: string): number {
        let width = 0;
        for (const ch of text) {
            width += isFullWidth(ch) ? this.config.baseFontSize : this.halfFontSize;
        }
        return width;
    }

    private inVisualRange(state: EditorState, row: number, col: number): boolean {
        if (state.vi_state.mode !== "visual") throw new Error("vi_state.mode is not visual");
        const start = state.vi_state.visualStart;
        const end = state.vi_state.visualEnd;
        if (row < start.row || row > end.row) {
            // 完全に対象外の行が範囲から除かれる
            return false;
        }
        if (
            (row === start.row && col < start.col) ||
            (row === end.row && col > end.col)
        ) {
            // 行内の対象範囲外が除かれる
            return false;
        }
        return true;
    }
}
