import type { EditorConfig } from "./config";
import type { EditorState } from "./state";
import type { Renderer } from "./renderer";
import { Line, getLines } from "./line";
import { isFunctionKey, isIgnoreKey, MOVE_KEYS, type MoveKey } from "./keys";
import { hideContainer, showContainer } from "./dom";
import { LOGICAL_HALF_WIDTH, LOGICAL_FULL_WIDTH, calcLogicalWidth, logicalWidthToCol } from "./utils";

export class Editor {
    private readonly config: EditorConfig;
    private readonly state: EditorState;
    private readonly container: HTMLDivElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly input: HTMLInputElement;
    private readonly renderer: Renderer;

    constructor(
        config: EditorConfig,
        state: EditorState,
        container: HTMLDivElement,
        canvas: HTMLCanvasElement,
        input: HTMLInputElement,
        renderer: Renderer,
    ) {
        this.config = config;
        this.state = state;
        this.container = container;
        this.canvas = canvas;
        this.input = input;
        this.renderer = renderer;
        this.init();
    }

    // ------------------------------
    // | initializing
    // ------------------------------

    private init(): void {
        this.renderer.applyConfig();
        this.render();
        this.setupListeners();
    }

    private setupListeners(): void {
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
            this.insertChar(this.input.value);
            this.scrollWindow();
            this.render();
            this.input.value = "";
            this.input.style.zIndex = "-1";
            setDestElValue();
        });

        const resizingMap: Record<string, () => void> = {
            ArrowLeft: () => {
                this.config.screencols = Math.min(this.config.screencols + 2, 80);
            },
            ArrowRight: () => {
                this.config.screencols = Math.max(2 + this.config.lines.lineNumberCols, this.config.screencols - 2);
            },
            ArrowUp: () => {
                this.config.screenrows = Math.min(this.config.screenrows + 1, 40);
            },
            ArrowDown: () => {
                this.config.screenrows = Math.max(1 + this.config.statusBarHeight, this.config.screenrows - 1);
            },
        };
        this.input.addEventListener("keydown", (e) => {
            if (isFunctionKey(e.key)) return;
            e.preventDefault();
            if (e.ctrlKey) return;
            if (e.isComposing) return;

            if (e.shiftKey) {
                const action = resizingMap[e.key];
                if (action) {
                    action();
                    this.renderer.applyConfig();
                    this.render();
                    return;
                }
            }

            if (e.altKey && e.code === "KeyV") {
                if (destEl) {
                    destEl.focus();
                    e.stopPropagation();
                }
                return;
            }

            // processing
            this.processKeypress(e);

            // drawing
            this.render();

            this.input.value = "";
            setDestElValue();
        });
    }

    // ------------------------------
    // | processing basic inputs
    // ------------------------------

    private processKeypress(e: KeyboardEvent): void {
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
                if (isIgnoreKey(key)) return;
                this.insertChar(key);
            }
        }
        this.scrollWindow();
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

        if (this.state.logicalWidth < this.state.logicaloff) {
            // decrease logicaloff
            this.state.logicaloff = this.state.logicalWidth;
        }

        const screencols = this.config.screencols;
        const lineNumberCols = this.config.lines.lineNumberCols;
        if (
            this.state.logicalWidth + lineNumberCols
            >= this.state.logicaloff + screencols
        ) {
            // スクロール時に常に列を開けるためLOGICAL_HALF_WIDHTを加算する
            this.state.logicaloff = this.state.logicalWidth - screencols
            + lineNumberCols + LOGICAL_HALF_WIDTH;
        }
    }

    private moveCursor(key: MoveKey): void {
        switch (key) {
            case MOVE_KEYS.LEFT: {
                if (this.state.col !== 0) {
                    const prevChar = this.currentLine.text.slice(this.state.col - 1, this.state.col);
                    this.state.logicalWidth -= calcLogicalWidth(prevChar);
                    this.state.col--;
                } else if (this.state.row > 0) {
                    const prevLine = this.prevLine as Line;
                    const prevLineLen = prevLine.size;
                    this.state.row--;
                    this.state.col = prevLineLen;
                    this.state.logicalWidth = calcLogicalWidth(prevLine.text);
                }
                break;
            }
            case MOVE_KEYS.RIGHT: {
                const currLine = this.currentLine;
                if (this.state.col < currLine.size) {
                    const currChar = currLine.text.slice(this.state.col, this.state.col + 1);
                    this.state.logicalWidth += calcLogicalWidth(currChar);
                    this.state.col++;
                } else if (this.nextLine && this.state.col === currLine.size) {
                    this.state.row++;
                    this.state.col = 0;
                    this.state.logicalWidth = 0;
                }
                break;
            }
            case MOVE_KEYS.UP: {
                if (this.state.row !== 0) {
                    const widthBeforeMove = this.state.logicalWidth;
                    const prevLine = this.prevLine as Line;
                    this.state.row--;
                    this.state.logicalWidth = Math.min(
                        this.state.logicalWidth, calcLogicalWidth(prevLine.text)
                    );
                    this.state.col = logicalWidthToCol(this.state.logicalWidth, prevLine.text);
                    this.state.logicalWidth = calcLogicalWidth(prevLine.text.slice(0, this.state.col));

                    this.alignCursorToLeft(widthBeforeMove);
                } else {
                    // 先頭行にいるとき
                    this.state.col = 0;
                    this.state.logicalWidth = 0;
                }
                break;
            }
            case MOVE_KEYS.DOWN: {
                if (this.state.row < this.state.lines.length - 1) {
                    const widthBeforeMove = this.state.logicalWidth;
                    const nextLine = this.nextLine as Line;
                    this.state.row++;
                    this.state.logicalWidth = Math.min(
                        this.state.logicalWidth, calcLogicalWidth(nextLine.text)
                    );
                    this.state.col = logicalWidthToCol(this.state.logicalWidth, nextLine.text);
                    this.state.logicalWidth = calcLogicalWidth(nextLine.text.slice(0, this.state.col));

                    this.alignCursorToLeft(widthBeforeMove);
                } else {
                    // 末尾業にいるとき
                    const text = this.currentLine.text;
                    this.state.col = text.length;
                    this.state.logicalWidth = calcLogicalWidth(text);
                }
                break;
            }
        }
    }

    /** 半角文字から全角文字に上下移動する時、移動前が移動後の後ろ側なら右に寄せる */
    private alignCursorToLeft(widthBeforeMove: number): void {
        if (this.state.logicalWidth >= widthBeforeMove + LOGICAL_FULL_WIDTH) {
            this.state.logicalWidth -= LOGICAL_HALF_WIDTH;
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
        this.state.logicalWidth = 0;
        this.insertRow(this.state.row, textAfter);
    }

    private insertChar(ch: string): void {
        const currLine = this.currentLine;
        if (this.state.col >= currLine.size) {
            this.appendTextToLine(currLine, ch);
        } else {
            this.insertTextInLine(currLine, ch, this.state.col);
        }
        this.state.logicalWidth += calcLogicalWidth(ch);
        this.state.col += ch.length;
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
            this.state.logicalWidth -= calcLogicalWidth(targetChar);
        } else {
            // append two lines
            const prevLine = this.prevLine as Line;
            this.state.col = prevLine.size;
            this.state.logicalWidth = calcLogicalWidth(prevLine.text);
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

    private insertTextInLine(line: Line, text: string, col: number): void {
        const before = line.text.slice(0, col);
        const after = line.text.slice(col);
        line.text = before + text + after;
    }

    private isAtTail(): boolean {
        return (
            this.state.row === this.state.lines.length - 1 &&
            this.state.col === this.currentLine.size
        );
    }

    private resetState(): void {
        this.state.row = 0;
        this.state.col = 0;
        this.state.px = 0;
        this.state.logicalWidth = 0;
        this.state.rowoff = 0;
        this.state.lines = [];
    }

    // ------------------------------
    // | rendering
    // ------------------------------

    private render(): void {
        this.renderer.render(this.state);
    }
}
