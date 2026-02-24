import type { EditorConfig } from "./config";
import type { EditorState } from "./state";
import { Line, getLines } from "./line";
import { isFunctionKey, MOVE_KEYS, type MoveKey } from "./keys";
import { isFullWidth } from "./utils";
import { hideContainer, showContainer } from "./dom";

type DrawingOptions = {
    stroke: boolean;
    fill: boolean;
};

type SquareContext = {
    connectLeft: boolean;
    connectRight: boolean;
};

export class Editor {
    private config: EditorConfig;
    private state: EditorState;
    private container: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private input: HTMLInputElement;

    private ctx: CanvasRenderingContext2D;

    constructor(
        config: EditorConfig,
        state: EditorState,
        container: HTMLDivElement,
        canvas: HTMLCanvasElement,
        input: HTMLInputElement
    ) {
        this.config = config;
        this.state = state;
        this.container = container;
        this.canvas = canvas;
        this.input = input;
        this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        this.init();
    }

    // ------------------------------
    // | initializing
    // ------------------------------

    private init(): void {
        this.initConfig();
        this.setupListeners();
        this.render();
    }

    private initConfig() {
        this.applyConfig();
        this.canvas.tabIndex = -1;
        this.canvas.style.outline = "none";

        this.ctx.textBaseline = "middle";
    }

    private setupListeners() {
        let destEl: HTMLInputElement | HTMLTextAreaElement | null = null;
        const setDestElValue = () => {
            if (!destEl) return;
            destEl.value = this.state.lines.map(l => l.text).join("\n");
        };

        document.addEventListener("keydown", (e) => {
            if (e.altKey && e.code === "KeyV") {
                const activeEl = document.activeElement;
                if (activeEl === this.input) return;

                if (
                    (activeEl instanceof HTMLInputElement) ||
                    (activeEl instanceof HTMLTextAreaElement)
                ) {
                    showContainer(this.container);

                    destEl = activeEl;
                    this.input.focus();

                    this.resetState();
                    this.state.lines = getLines(activeEl.value);
                    this.render();
                }
                return;
            }

            if (e.altKey && e.code === "KeyQ") {
                if (this.container.style.visibility === "hidden") {
                    showContainer(this.container);
                } else {
                    hideContainer(this.container);
                }
            }
        });

        this.canvas.addEventListener("click", () => {
            this.input.focus();
            this.render();
        });

        this.input.addEventListener("compositionstart", () => {
            // 日本語変換が始まったとき
            this.input.style.zIndex = "9999";
        });
        this.input.addEventListener("compositionend", () => {
            // 日本語変換が終わったとき
            this.insertText(this.input.value);
            this.scrollWindow();
            this.render();
            this.input.value = "";
            this.input.style.zIndex = "-1";
            setDestElValue();
        });
        this.input.addEventListener("keydown", (e) => {
            if (isFunctionKey(e.key)) return;
            e.preventDefault();
            if (e.ctrlKey) return;
            if (e.isComposing) return;

            if (e.altKey && e.code === "KeyV") {
                if (destEl) {
                    destEl.focus();
                    e.stopPropagation();
                }
                return;
            }

            // processing
            this.processKeypress(e);
            this.scrollWindow();

            // drawing
            this.render();

            this.input.value = "";
            setDestElValue();
        });
    }

    // ------------------------------
    // | processing basic inputs
    // ------------------------------

    private processKeypress(e: KeyboardEvent) {
        const key = e.key;
        if (isFunctionKey(key)) return;

        switch (key) {
            case "ArrowLeft": {
                this.moveCursor(MOVE_KEYS.LEFT);
                break;
            }
            case "ArrowRight": {
                this.moveCursor(MOVE_KEYS.RIGHT);
                break;
            }
            case "ArrowUp": {
                this.moveCursor(MOVE_KEYS.UP);
                break;
            }
            case "ArrowDown": {
                this.moveCursor(MOVE_KEYS.DOWN);
                break;
            }

            case "Delete":
            case "Backspace": {
                if (key === "Delete") {
                    if (this.isAtTail()) return;
                    this.moveCursor(MOVE_KEYS.RIGHT);
                }
                this.deleteChar();
                break;
            }
            case "Enter": {
                this.insertNewLine();
                break;
            }
            default: {
                if (e.key.length > 1) return;
                this.insertText(key);
            }
        }
    }

    // ------------------------------
    // | editing
    // ------------------------------

    private scrollWindow(): void {
        if (this.state.row < this.state.rowoff) {
            // decrease rowoff
            this.state.rowoff = this.state.row;
        }
        if (this.state.row + this.config.statusBarHeight >= this.state.rowoff + this.config.screenrows) {
            // increase rowoff
            this.state.rowoff = this.state.row - this.config.screenrows + 1 + this.config.statusBarHeight;
        }

        if (this.state.px < this.state.pxoff) {
            // decrease pxoff
            this.state.pxoff = this.state.px;
        }

        const fontsize = this.config.baseFontSize / 2;
        const screenWidth = this.config.screencols * fontsize;
        if (this.state.px + this.lineNumberMargin >= this.state.pxoff + screenWidth) {
            // increase pxoff
            this.state.pxoff = this.state.px - (fontsize * this.config.screencols)
            + fontsize + this.lineNumberMargin;
        }
    }

    private moveCursor(key: MoveKey): void {
        switch (key) {
            case MOVE_KEYS.LEFT: {
                if (this.state.col !== 0) {
                    const prevChar = this.currentLine.text.slice(this.state.col - 1, this.state.col);
                    this.state.px -= this.calcWidth(prevChar);
                    this.state.col--;
                } else if (this.state.row > 0) {
                    const prevLine = this.prevLine as Line;
                    const prevLineLen = prevLine.size;
                    this.state.row--;
                    this.state.col = prevLineLen;
                    this.state.px = this.calcWidth(prevLine.text);
                }
                break;
            }
            case MOVE_KEYS.RIGHT: {
                const currLine = this.currentLine;
                if (this.state.col < currLine.size) {
                    const currChar = currLine.text.slice(this.state.col, this.state.col + 1);
                    this.state.px += this.calcWidth(currChar);
                    this.state.col++;
                } else if (this.nextLine && this.state.col === currLine.size) {
                    this.state.row++;
                    this.state.col = 0;
                    this.state.px = 0;
                }
                break;
            }
            case MOVE_KEYS.UP: {
                if (this.state.row !== 0) {
                    const cxBeforeMove = this.state.px;
                    const prevLine = this.prevLine as Line;
                    this.state.row--;
                    this.state.px = Math.min(this.state.px, this.calcWidth(prevLine.text));
                    this.state.col = this.cxToCol(this.state.px, prevLine.text);
                    this.state.px = this.calcWidth(prevLine.text.slice(0, this.state.col));

                    this.alignCursorToLeft(cxBeforeMove);
                } else {
                    this.state.col = 0;
                    this.state.px = 0;
                }
                break;
            }
            case MOVE_KEYS.DOWN: {
                if (this.state.row < this.state.lines.length - 1) {
                    const cxBeforeMove = this.state.px;
                    const nextLine = this.nextLine as Line;
                    this.state.row++;
                    this.state.px = Math.min(this.state.px, this.calcWidth(nextLine.text));
                    this.state.col = this.cxToCol(this.state.px, nextLine.text);
                    this.state.px = this.calcWidth(nextLine.text.slice(0, this.state.col));

                    this.alignCursorToLeft(cxBeforeMove);
                } else {
                    const text = this.currentLine.text;
                    this.state.col = text.length;
                    this.state.px = this.calcWidth(text);
                }
                break;
            }
        }
    }

    /** 半角文字から全角文字に上下移動する時、移動前が移動後の後ろ側なら右に寄せる */
    private alignCursorToLeft(cxBeforeMove: number): void {
        if (this.state.px >= cxBeforeMove + this.config.baseFontSize / 2) {
            this.state.px -= this.config.baseFontSize;
            this.state.col--;
        }
    }

    private insertNewLine(): void {
        const currLine = this.currentLine;
        const textBefore = currLine.text.slice(0, this.state.col);
        const textAfter = currLine.text.slice(this.state.col);
        currLine.text = textBefore;
        this.state.row++;
        this.state.col = 0;
        this.state.px = 0;
        this.insertRow(this.state.row, textAfter);
    }

    private insertText(text: string): void {
        const currLine = this.currentLine;
        if (this.state.col >= currLine.size) {
            this.appendTextToLine(currLine, text);
        } else {
            this.insertTextInLine(currLine, text);
        }
        this.state.px += this.calcWidth(text);
        this.state.col += text.length;
    }

    /** col - 1 の文字を削除する */
    private deleteChar(): void {
        if (this.state.row === 0 && this.state.col === 0) return;

        const currLine = this.currentLine;
        const text = currLine.text;
        if (this.state.col > 0) {
            const targetChar = text[this.state.col - 1] as string;
            const modified = text.slice(0, this.state.col - 1) + text.slice(this.state.col);
            currLine.text = modified;
            this.state.col--;
            this.state.px -= this.calcWidth(targetChar);
        } else {
            // append two lines
            const prevLine = this.prevLine as Line;
            this.state.col = prevLine.size;
            this.state.px = this.calcWidth(prevLine.text);
            this.appendTextToLine(prevLine, currLine.text);
            this.deleteRow(this.state.row);
            this.state.row--;
        }
    }

    // ------------------------------
    // | helpers
    // ------------------------------

    private get currentLine(): Line {
        return this.state.lines[this.state.row] as Line;
    }

    private get nextLine(): Line | undefined {
        return this.state.lines[this.state.row + 1];
    }

    private get prevLine(): Line | undefined {
        return this.state.lines[this.state.row - 1];
    }

    private insertRow(row: number, text: string): void {
        if (row < 0 || row > this.state.lines.length) return;
        this.state.lines.splice(row, 0, new Line(text));
    }

    private deleteRow(row: number): void {
        if (row < 0 || row >= this.state.lines.length) return;
        this.state.lines.splice(row, 1);
    }

    private appendTextToLine(line: Line, text: string): void {
        line.text += text;
    }

    private insertTextInLine(line: Line, text: string): void {
        const before = line.text.slice(0, this.state.col);
        const after = line.text.slice(this.state.col);
        line.text = before + text + after;
    }

    private calcWidth(text: string): number {
        let width = 0;
        for (const ch of text) {
            width += isFullWidth(ch)
                ? this.config.baseFontSize
                : this.config.baseFontSize / 2;;
        }
        return width;
    }

    private cxToCol(cx: number, text: string): number {
        let width = 0;
        let col = 0;
        for (const ch of text) {
            width += this.calcWidth(ch);
            if (width > cx) break;
            col++;
        }
        return col;
    }

    private isAtTail(): boolean {
        return (
            this.state.row === this.state.lines.length - 1 &&
            this.state.col === this.currentLine.size
        );
    }

    private applyConfig(): void {
        const width = this.config.screencols * (this.config.baseFontSize / 2);
        const height = this.config.screenrows * this.config.lines.height;

        // CSSの設定
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        // CSSの解像度と物理ピクセルの解像度の比から正確なピクセル数を求める
        const dpr = window.devicePixelRatio;
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.ctx.font = `${this.config.baseFontSize}px ${this.config.fontFamily}`;
    }

    private resetState(): void {
        this.state.row = 0;
        this.state.col = 0;
        this.state.px = 0;
        this.state.rowoff = 0;
        this.state.pxoff = 0;
        this.state.lines = [];
    }

    // ------------------------------
    // | rendering
    // ------------------------------

    private render(): void {
        this.clearCanvas();
        this.drawLines();
        this.drawCursor();
        this.drawStatusBar();
    }

    private clearCanvas(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private drawLines() {
        const px = this.lineNumberMargin;

        for (let y = 0; y < this.config.screenrows - this.config.statusBarHeight; y++) {
            const targetRow = y + this.state.rowoff;
            const py = y * this.config.lines.height + this.halfLineHeight;

            let rowDisplay;
            if (this.config.lines.relativeNumbers) {
                rowDisplay = (this.state.row === targetRow)
                    ? targetRow + 1
                    : Math.abs(this.state.row - targetRow);
            } else {
                rowDisplay = targetRow + 1;
            }

            const line = this.state.lines[targetRow];
            if (line) {
                if (this.config.lines.number) {
                    this.drawLineNumber(px, py, targetRow, rowDisplay);
                }
                this.drawLineText(px, py, line.text);
            }
        }
    }

    private drawCursor() {
        const currLine = this.currentLine;
        const text = currLine.text;

        const x = this.state.px - this.state.pxoff + this.lineNumberMargin;
        const y = (this.state.row - this.state.rowoff) * this.config.lines.height;
        const w = this.calcWidth(text[this.state.col] ?? "");
        const h = this.config.lines.height;
        this.ctx.fillStyle = this.config.colors.cursorBody;
        this.ctx.strokeStyle = this.config.colors.cursorOutline;
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeRect(x, y, w, h);
    }

    private drawStatusBar(): void {
        const y = (this.config.screenrows - this.config.statusBarHeight) * this.config.lines.height;
        const w = this.config.screencols * this.config.baseFontSize / 2;
        const h = this.config.statusBarHeight * this.config.lines.height;
        this.ctx.fillStyle = this.config.colors.statusBarBg;
        this.ctx.fillRect(0, y, w, h);

        this.ctx.fillStyle = this.config.colors.statusBarText;
        this.ctx.textAlign = "right";
        const rowcol = `${this.state.row + 1},${this.state.col + 1}`;
        this.ctx.fillText(rowcol, w, y + this.halfLineHeight);
    }

    private drawLineNumber(x: number, y: number, row: number, lineNum: number) {
        this.ctx.fillStyle = (row === this.state.row)
            ? this.config.colors.lineNumberCurrent
            : this.config.colors.lineNumber;
        this.ctx.textAlign = "right";
        // 行番号の右側に空白1つ分開ける
        this.ctx.fillText(lineNum.toString(), x - this.config.baseFontSize / 2, y);
    }

    private drawLineText(x: number, y: number, text: string): void {
        this.ctx.textAlign = "start";
        const startCol = this.cxToCol(this.state.pxoff, text);
        const subPixelOffset = this.calcWidth(text.slice(0, startCol)) - this.state.pxoff;
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

    private drawEmptyFullWidth(x: number, y: number, text: string, col: number): void {
        const adjustedY = y - this.config.baseFontSize / 2;
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

    private get lineNumberMargin(): number {
        return (this.config.lines.number)
            ? this.config.lines.lineNumberCols * this.config.baseFontSize / 2
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

    private drawStraightLine(start: { x: number, y: number }, end: { x: number, y: number }) {
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.closePath();
        this.ctx.stroke();
    }
}
