import type { EditorConfig } from "./config";
import type { EditorState, VisualState } from "./state";
import type { Line } from "./line";
import { enumerate, isFullWidth, stringWidthToCol } from "./utils";

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
        this.drawStatusBar(state, state.vi.cmd.join(""));
        this.drawCursor(state);
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
        const textPx = this.lineNumberPadding(state.lines.length);

        const halfFontSize = this.halfFontSize;
        const lineHeight = this.lineHeight;
        const halfLineHeight = this.halfLineHeight;
        const isLineNumberOn = this.config.lineNumbers !== "off";
        const isRelative = this.config.lineNumbers === "relative";
        const lineNumberCols = this.lineNumberCols(state.lines.length);

        for (let y = 0; y < this.config.screenrows - this.config.statusBarHeight; y++) {
            const targetRow = y + state.scroll.rowoff;
            const py = y * lineHeight + halfLineHeight;

            const line = state.lines[targetRow];
            if (!line) {
                this.drawString(0, py, "~", this.config.colors.lineNumber.normal);
                continue;
            }

            this.drawLineText(state, targetRow, textPx, py, line.text);

            if (!isLineNumberOn) continue;

            const isCurrentRow = state.cursor.row === targetRow;
            const absoluteRowNumber = targetRow + 1;

            const rowDisplayNumber = (
                isRelative
                ? (
                    isCurrentRow
                    ? absoluteRowNumber
                    : Math.abs(state.cursor.row - targetRow)
                )
                : absoluteRowNumber
            );
            const offset = (lineNumberCols - rowDisplayNumber.toString().length) * halfFontSize;
            const px = (isRelative && targetRow === state.cursor.row) ? 0 : offset;
            this.drawLineNumber(state, px + halfFontSize, py, targetRow, rowDisplayNumber);
        }
    }

    private drawCursor(state: EditorState): void {
        if (state.vi.state.mode === "command") {
            this.drawCursorAtStatusBar(state);
        } else {
            if (state.cursor.row >= state.scroll.rowoff + this.config.screenrows - 1) {
                return;
            }
            const currLine = state.lines[state.cursor.row] as Line;
            const text = currLine.text;
            const lineheight = this.lineHeight;
            const x =
                (state.cursor.visualCol - state.scroll.visualColoff) * this.halfFontSize + this.lineNumberPadding(state.lines.length);
            const y = (state.cursor.row - state.scroll.rowoff) * lineheight;
            const ch = text[state.cursor.col];

            this.drawCursorAt(state, x, y, ch);
        }
    }

    private drawCursorAtStatusBar(state: EditorState): void {
        if (state.vi.state.mode !== "command") throw new Error("mode is not command");

        const x = state.vi.state.sBarVisualCol * this.halfFontSize;
        const y = (this.config.screenrows - 1) * this.lineHeight;
        const ch = state.vi.cmd[state.vi.state.sBarCol];
        this.drawCursorAt(state, x, y, ch);
    }

    private drawCursorAt(state: EditorState, x: number, y: number, ch = " "): void {
        if (ch.length > 1) throw new Error("ch must be a char or empty char");

        const isUnder = state.cursor.style === "under";
        const isVertical = state.cursor.style === "vertical";

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

        if (state.vi.state.mode === "command") {
            this.drawString(0, this.bottomTextY, text, this.config.colors.statusBar.text);
        } else {
            const modeLabel = (state.vi.state.mode === "visual" && state.vi.state.linewise)
                ? "VISUAL LINE"
                : state.vi.state.mode.toUpperCase();
            const macroSuffix = (state.vi.macro.recording)
                ? ` recording @${state.vi.macro.recording}`
                : "";
            const statusText = `-- ${modeLabel} --${macroSuffix}   ${text}`;
            this.drawString(0, this.bottomTextY, statusText, this.config.colors.statusBar.text);
        }

        this.drawStatusBarRC(state.cursor.row, state.cursor.col, state.cursor.visualCol);
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

    /** draw row/col in the status bar */
    private drawStatusBarRC(row: number, col: number, width: number): void {
        this.ctx.fillStyle = this.config.colors.statusBar.text;
        const rc = `${row + 1},${col + 1}(${width})`;
        const x = this.config.screencols * this.halfFontSize - this.calcWidth(rc);
        this.drawString(x, this.bottomTextY, rc, this.config.colors.statusBar.text);
    }

    private drawLineNumber(
        state: EditorState,
        x: number,
        y: number,
        absRow: number,
        dispNum: number,
    ): void {
        const color = (
            absRow === state.cursor.row
            ? this.config.colors.lineNumber.current
            : this.config.colors.lineNumber.normal
        );
        this.drawString(x, y, dispNum.toString(), color)
    }

    private drawLineText(
        state: EditorState,
        lineNumber: number,
        x: number,
        y: number,
        text: string
    ): void {
        const lineTextWidth = this.getLineTextWidth(state.lines);

        const startCol = stringWidthToCol(state.scroll.visualColoff, text);
        const startOffsetText = text.slice(startCol);
        const endCol = stringWidthToCol(lineTextWidth, startOffsetText) + 1;
        /** 前後の溢れた全角文字を含む. 末尾の1文字は半角でも含まれてしまうが影響がないため許容する */
        const sliced = startOffsetText.slice(0, endCol);

        const leftOverflow = (
            sliced !== "" &&
            this.calcWidth(text.slice(0, startCol)) !== (state.scroll.visualColoff * this.halfFontSize)
        );

        /** 文字列の左側を"<"に置き換える */
        const leftAlignedText = (leftOverflow) ? "<" + sliced.slice(1) : sliced;
        /** endColに文字が存在する=文字があふれている可能性 */
        const rightOverflow = (startOffsetText[endCol] && this.calcWidth(leftAlignedText) > lineTextWidth * this.halfFontSize);
        /** 文字列の右側を">"に置き換える */
        const offsetText =
            (rightOverflow) ? leftAlignedText.slice(0, -1) + ">"
            : leftAlignedText;

        if (state.vi.state.mode === "visual") {
            const vi_state = state.vi.state;
            this.drawString(x, y, offsetText, this.config.colors.text.normal, true);

            if (offsetText === "" && this.inVisualRange(vi_state, lineNumber, startCol)) {
                this.drawCursorAt(state, this.lineNumberPadding(state.lines.length), y - this.halfLineHeight);
            } else {
                let cursorX = x;
                for (const [ch, i] of enumerate(offsetText)) {
                    if (this.inVisualRange(vi_state, lineNumber, i + startCol)) {
                        this.drawCursorAt(state, cursorX, y - this.halfLineHeight, ch);
                    }
                    cursorX += this.calcWidth(ch);
                }
            }
        } else {
            this.drawString(x, y, offsetText, this.config.colors.text.normal, true);
        }
    }

    private drawChar(x: number, y: number, ch: string): void {
        // if (ch === "\r") {
        //     this.ctx.fillStyle = "red";
        //     this.ctx.fillRect(x, y - this.halfLineHeight, this.halfFontSize, this.lineHeight);
        //     this.ctx.fillStyle = "white";
        //     this.ctx.fillText("R", x, y);
        //     return;
        // }
        // if (ch === "\n") {
        //     this.ctx.fillStyle = "blue";
        //     this.ctx.fillRect(x, y - this.halfLineHeight, this.halfFontSize, this.lineHeight);
        //     this.ctx.fillStyle = "white";
        //     this.ctx.fillText("N", x, y);
        //     return;
        // }
        this.ctx.fillText(ch, x, y);
    }

    private drawString(
        x: number,
        y: number,
        text: string,
        color: string,
        renderWhitespace = false,
    ): void {
        for (const [ch, i] of enumerate(text)) {
            this.ctx.fillStyle = color;
            this.drawChar(x, y, ch);
            if (renderWhitespace && this.config.renderWhitespace === "all") {
                if (ch === " " /* half width whitespace */) {
                    this.drawEmptyHalfWidth(x, y);
                } else if (ch === "　" /* full width whitespace */) {
                    this.drawEmptyFullWidth(x, y, text, i);
                }
            }
            x += this.calcWidth(ch);
        }
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

    private lineNumberPadding(lineLen: number): number {
        return this.config.lineNumbers !== "off"
            ? Math.max(this.config.minLineNumberCols, String(lineLen).length + 2) * this.halfFontSize
            : 0;
    }

    private lineNumberCols(lineLen: number): number {
        return this.config.lineNumbers !== "off" ? String(lineLen).length : 0;
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

    private getLineTextWidth(lines: Line[]): number {
        return this.config.screencols - this.lineNumberCols(lines.length) - 2;
    }

    private inVisualRange(visualState: VisualState, row: number, col: number): boolean {
        const first = visualState.visualFirst;
        const last = visualState.visualLast;
        if (row < first.row || row > last.row) {
            // 対象外の行範囲が除かれる
            return false;
        }
        if (
            (row === first.row && col < first.col) ||
            (row === last.row && col > last.col)
        ) {
            // 行内前後の範囲が除かれる
            return false;
        }
        return true;
    }
}
