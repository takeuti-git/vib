import type { EditorConfig } from "./config";
import type { Renderer } from "./renderer";
import { type EditorState, resetState } from "./state";
import { Line, getLines } from "./line";
import { isFunctionKey, MOVE_KEYS, type MoveKey } from "./keys";
import { hideContainer, showContainer } from "./dom";
import { LOGICAL_HALF_WIDTH, LOGICAL_FULL_WIDTH, calcLogicalWidth, logicalWidthToCol } from "./utils";
import { isValidCmd, type NormalCmd } from "./myvim/cmd";
import { getFirstNonWhitespaceCol, vi_getCountMotion } from "./myvim/motion";

export class Editor {
    private readonly config: EditorConfig;
    private readonly state: EditorState;
    private readonly container: HTMLDivElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly input: HTMLInputElement;
    private readonly renderer: Renderer;

    private vi_insertResolve: (() => void) | null = null;

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

                    resetState(this.state);
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

        const updateCanvas = () => {
            this.renderer.applyConfig();
            this.render();
        };

        let windowResizeTimer: number = 0;
        window.addEventListener("resize", () => {
            if (windowResizeTimer) {
                clearTimeout(windowResizeTimer);
            }
            windowResizeTimer = setTimeout(updateCanvas, 500);
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
            if (this.state.vi_mode === "insert") {
                this.insertText(this.input.value);
                this.scrollWindow();
                this.render();
                setDestElValue();
                this.state.vi_insertBuf.push(this.input.value);
            }
            this.input.value = "";
            this.input.style.zIndex = "-1";
        });

        const resizingMap: Record<string, () => void> = {
            ArrowLeft: () => {
                this.config.screencols = Math.min(this.config.screencols + 2, 80);
            },
            ArrowRight: () => {
                this.config.screencols = Math.max(2 + this.config.lineNumberCols, this.config.screencols - 2);
            },
            ArrowUp: () => {
                this.config.screenrows = Math.min(this.config.screenrows + 1, 40);
            },
            ArrowDown: () => {
                this.config.screenrows = Math.max(1 + this.config.statusBarHeight, this.config.screenrows - 1);
            },
        };

        this.input.addEventListener("keydown", (e) => {
            const key = e.key
            if (isFunctionKey(key)) return;
            e.preventDefault();
            if (e.isComposing) return;

            if (e.shiftKey) {
                const resize = resizingMap[key];
                if (resize) {
                    resize();
                    updateCanvas();
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

            if (key === "Escape" || (key === "[" && e.ctrlKey)) {
                this.state.vi_mode = "normal";
                this.state.vi_cmd = "";
                this.vi_insertResolve?.();
                this.vi_insertResolve = null;
                this.render();
                return;
            }

            // processing
            if (this.state.vi_mode === "normal") {
                if (key === "Shift") return;
                this.state.vi_cmd += key;
                const result = this.vi_processInput(this.state.vi_cmd);
                if (result === 0 || result === 1) {
                    this.state.vi_cmd = "";
                }
            }
            else if (this.state.vi_mode === "insert") {
                this.processKeypress(e);
            }
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

    private vi_normalCmdMap: Record<NormalCmd, () => void> = {
        "h": () => this.vi_moveCursor(MOVE_KEYS.LEFT),
        "j": () => this.vi_moveCursor(MOVE_KEYS.DOWN),
        "k": () => this.vi_moveCursor(MOVE_KEYS.UP),
        "l": () => this.vi_moveCursor(MOVE_KEYS.RIGHT),
        "i": () => this.vi_goInsert(false),
        "a": () => this.vi_goInsert(true),
        "I": () => {
            this.moveCursorToFirstNonWhitespace();
            this.vi_goInsert(false);
        },
        "A": () => {
            this.moveCursorToLast();
            this.vi_goInsert(true);
        },
        "0": () => {
            this.state.col = 0;
            this.state.logicalWidth = 0;
            this.state.logicaloff = 0;
        },
    };

    private vi_processInput(input: string): 0 | 1 | 2 {
        const [count, motion] = vi_getCountMotion(input);
        if (motion === null) return 2; // まだcountまでしか入力がないとき

        if (!isValidCmd(motion)) return 1;

        const fn = this.vi_normalCmdMap[motion as NormalCmd];
        if (fn) {
            if (["a", "i", "A", "I"].includes(motion)) {
                fn();
                (async () => {
                    await new Promise<void>(resolve => {
                        this.vi_insertResolve = resolve;
                    });
                    console.log([this.state.vi_insertBuf]);
                    for (let i = 0; i < count - 1; i++) {
                        for (const token of this.state.vi_insertBuf) {
                            if (token === "TAB") {
                                this.indent();
                            } else if (token === "ENTER") {
                                this.insertNewLine();
                            } else if (token === "BACKSPACE") {
                                this.deleteChar();
                            } else if (token === "DELETE") {
                                if (!this.isAtTail()) {
                                    this.moveCursor(MOVE_KEYS.RIGHT);
                                    this.deleteChar();
                                }
                            } else {
                                this.insertText(token);
                            }
                        }
                    }
                    this.state.vi_insertBuf = [];
                    this.vi_moveCursor(MOVE_KEYS.LEFT);
                    this.render();
                })();
            } else {
                for (let i = 0; i < count; i++) {
                    fn();
                }
            }
            return 0;
        }
        return 2;
    }

    private vi_goInsert(isAppend: boolean): void {
        this.state.vi_mode = "insert";
        if (isAppend && this.state.col !== this.currentLine.size) {
            this.moveCursor(MOVE_KEYS.RIGHT);
        }
    }

    private keyMap: Record<string, () => void> = {
        // "ArrowLeft": () => this.moveCursor(MOVE_KEYS.LEFT),
        // "ArrowRight": () => this.moveCursor(MOVE_KEYS.RIGHT),
        // "ArrowUp": () => this.moveCursor(MOVE_KEYS.UP),
        // "ArrowDown": () => this.moveCursor(MOVE_KEYS.DOWN),
        "Backspace": () => {
            this.deleteChar();
            this.state.vi_insertBuf.push("BACKSPACE");
        },
        "Delete": () => {
            if (this.isAtTail()) return;
            this.moveCursor(MOVE_KEYS.RIGHT);
            this.deleteChar();
            this.state.vi_insertBuf.push("DELETE");
        },
        "Enter": () => {
            this.insertNewLine();
            this.state.vi_insertBuf.push("ENTER");
        },
        "Tab": () => {
            this.indent();
            this.state.vi_insertBuf.push("TAB");
        },
    };

    private processKeypress(e: KeyboardEvent): void {
        const key = e.key;

        const action = this.keyMap[key];

        if (action) {
            action();
        } else {
            if (key.length > 1) return;
            this.insertText(key);
            this.state.vi_insertBuf.push(key);
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

        if (this.state.logicalWidth < this.state.logicaloff) {
            // decrease logicaloff
            this.state.logicaloff = this.state.logicalWidth;
        }

        const screencols = this.config.screencols;
        const lineNumberCols = this.config.lineNumberCols;
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
                    this.moveCursorLeft();
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
                    this.moveCursorRight();
                } else if (this.nextLine && this.state.col === currLine.size) {
                    this.state.row++;
                    this.state.col = 0;
                    this.state.logicalWidth = 0;
                }
                break;
            }
            case MOVE_KEYS.UP: {
                if (this.state.row !== 0) {
                    this.moveCursorUp();
                } else {
                    // 先頭行にいるとき
                    this.state.col = 0;
                    this.state.logicalWidth = 0;
                }
                break;
            }
            case MOVE_KEYS.DOWN: {
                if (this.state.row < this.state.lines.length - 1) {
                    this.moveCursorDown();
                } else {
                    // 末尾行にいるとき
                    const text = this.currentLine.text;
                    this.state.col = text.length;
                    this.state.logicalWidth = calcLogicalWidth(text);
                }
                break;
            }
        }
    }

    private vi_moveCursor(key: MoveKey): void {
        switch (key) {
            case MOVE_KEYS.LEFT: {
                if (this.state.col !== 0) {
                    this.moveCursorLeft();
                }
                break;
            }
            case MOVE_KEYS.RIGHT: {
                if (this.state.col < this.currentLine.size - 1) {
                    this.moveCursorRight();
                }
                break;
            }
            case MOVE_KEYS.UP: {
                if (this.state.row !== 0) {
                    this.moveCursorUp();
                }
                break;
            }
            case MOVE_KEYS.DOWN: {
                if (this.state.row < this.state.lines.length - 1) {
                    this.moveCursorDown();
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

    private insertText(text: string): void {
        const currLine = this.currentLine;
        if (this.state.col >= currLine.size) {
            this.appendTextToLine(currLine, text);
        } else {
            this.insertTextInLine(currLine, text);
        }
        this.state.logicalWidth += calcLogicalWidth(text);
        this.state.col += text.length
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

    private indent(): void {
        const tabstop = this.config.tabstop;
        const count = tabstop - (this.state.logicalWidth % tabstop);
        this.insertText(" ".repeat(count));
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

    private isAtTail(): boolean {
        return (
            this.state.row === this.state.lines.length - 1 &&
            this.state.col === this.currentLine.size
        );
    }

    private moveCursorLeft(): void {
        const prevChar = this.currentLine.text.slice(this.state.col - 1, this.state.col);
        this.state.logicalWidth -= calcLogicalWidth(prevChar);
        this.state.col--;
    }

    private moveCursorRight(): void {
        const currChar = this.currentLine.text.slice(this.state.col, this.state.col + 1);
        this.state.logicalWidth += calcLogicalWidth(currChar);
        this.state.col++;
    }

    private moveCursorUp(): void {
        const widthBeforeMove = this.state.logicalWidth;
        const prevLine = this.prevLine as Line;
        this.state.row--;
        this.state.logicalWidth = Math.min(
            this.state.logicalWidth, calcLogicalWidth(prevLine.text)
        );
        this.state.col = logicalWidthToCol(this.state.logicalWidth, prevLine.text);
        this.state.logicalWidth = calcLogicalWidth(prevLine.text.slice(0, this.state.col));

        this.alignCursorToLeft(widthBeforeMove);
    }

    private moveCursorDown(): void {
        const widthBeforeMove = this.state.logicalWidth;
        const nextLine = this.nextLine as Line;
        this.state.row++;
        this.state.logicalWidth = Math.min(
            this.state.logicalWidth, calcLogicalWidth(nextLine.text)
        );
        this.state.col = logicalWidthToCol(this.state.logicalWidth, nextLine.text);
        this.state.logicalWidth = calcLogicalWidth(nextLine.text.slice(0, this.state.col));

        this.alignCursorToLeft(widthBeforeMove);
    }

    private moveCursorToFirstNonWhitespace(): void {
        const line = this.currentLine;
        const start = getFirstNonWhitespaceCol(line.text);
        this.state.col = start;
        this.state.logicalWidth = calcLogicalWidth(line.text.slice(0, start));
    }

    private moveCursorToLast(): void {
        const line = this.currentLine;
        const end = line.text.length;
        this.state.col = end;
        this.state.logicalWidth = calcLogicalWidth(line.text);
    }

    // ------------------------------
    // | rendering
    // ------------------------------

    private render(): void {
        this.renderer.render(this.state);
    }
}
