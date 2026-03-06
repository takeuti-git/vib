import type { EditorConfig } from "./config";
import type { Renderer } from "./renderer";
import { type EditorState, resetState } from "./state";
import { Line, getLines } from "./line";
import { isFunctionKey, MOVE_KEYS, type MoveKey } from "./keys";
import { hideContainer, showContainer } from "./dom";
import { LOGICAL_HALF_WIDTH, LOGICAL_FULL_WIDTH, calcLogicalWidth, logicalWidthToCol } from "./utils";
import { getCountToNextChar, getFirstNonWhitespaceCol, getMotionRange } from "./myvim/motion";
import { parseCommand } from "./myvim/parser";
import type { InsertCommand, Motion } from "./myvim/parser/command";
import { readClipboard, writeClipboard } from "./clipboard";

export class Editor {
    private readonly config: EditorConfig;
    private readonly state: EditorState;
    private readonly container: HTMLDivElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly input: HTMLInputElement;
    private readonly renderer: Renderer;

    // private static readonly VI_MOVED = "\x01"; // 未使用の文字コードを移動検知のフラグに使う
    private static readonly VI_ENTER = "\n";
    private static readonly VI_TAB = "\t";
    private static readonly VI_BACKSPACE = "\x08";
    private static readonly VI_DELETE = "\x7F";

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

                const value = this.input.value;
                if (value !== "") {
                    this.state.vi_insertBuf.push(value);
                }
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

            this.input.value = "";
            if (key === "Escape" || (key === "[" && e.ctrlKey)) {
                this.state.vi_mode = "normal";
                this.state.vi_cmd = [];
                this.state.vi_insertResolve?.();
                this.state.vi_insertResolve = null;
                this.render();
                return;
            }

            // processing
            if (this.state.vi_mode === "normal") {
                if (key.length > 1) return;
                const input = e.ctrlKey ? `<C-${key}>` : key;
                this.state.vi_cmd.push(input);
                if (this.state.vi_cmd.length > 6) {
                    this.state.vi_cmd = ["too long"];
                    this.render();
                    this.state.vi_cmd = [];
                    return;
                }
                const result = this.vi_processInput(this.state.vi_cmd);
                this.scrollWindow();
                this.render();
                if (result === 0) {
                    this.state.vi_cmd = [];
                }
                if (result === 1) {
                    this.state.vi_cmd = ["unknown cmd"];
                    this.render();
                    this.state.vi_cmd = [];
                    return;
                }
            }
            else if (this.state.vi_mode === "insert") {
                this.processKeypress(e);
                this.scrollWindow();
                this.render();
            }

            // drawing
            // this.render();

            setDestElValue();
        });
    }

    // ------------------------------
    // | processing basic inputs
    // ------------------------------

    // remaining = ["w","W","b","B","e","E",
    //              "gg","G","H","L","%",
    // @ts-expect-error
    private motionMap: Record<Motion, () => void> = {
        "h": () => this.vi_moveCursor(MOVE_KEYS.LEFT),
        "l": () => this.vi_moveCursor(MOVE_KEYS.RIGHT),
        "j": () => this.vi_moveCursor(MOVE_KEYS.DOWN),
        "k": () => this.vi_moveCursor(MOVE_KEYS.UP),
        "0": () => this.moveCursorToFirst(),
        "_": () => this.moveCursorToFirstNonWhitespace(),
        "^": () => this.moveCursorToFirstNonWhitespace(),
        "$": () => this.moveCursorToLast(),
    };

    private insertMap: Record<InsertCommand, () => void> = {
        i: () => {},
        a: () => {},
        I: () => this.moveCursorToFirstNonWhitespace(),
        A: () => this.moveCursorToLast(),
        o: () => this.insertNewLineNext(),
        O: () => this.insertNewLineCurrent(),
    };

    private vi_processInput(input: string[]): 0 | 1 | 2 {
        let parseResult = parseCommand(input);
        if (parseResult.status === "unknown") {
            console.log("its unknown");
            return 1;
        }
        if (parseResult.status === "pending") {
            console.log("its pending");
            return 2;
        }
        if (parseResult.status === "ok") {
            console.log("its ok");
        }

        const data = parseResult.value;
        const datatype = data.type;
        const count = data.count === null ? 1 : data.count;

        if (datatype === "motion") {
            const motion = data.motion;
            const motiontype = motion.type;
            if (motiontype === "char") {
                const fn = this.motionMap[motion.name];
                for (let i = 0; i < count; i++) {
                    if (!fn) {
                        console.log("fn is not mapped yet");
                        break;
                    }
                    fn();
                }
            }
            else if (motiontype === "find") {
                const { name, arg } = motion;
                if (name === "f") {
                    const text = this.currentLine.text.slice(this.state.col + 1);
                    const moveAmount = getCountToNextChar(arg, text, { limit: count });
                    this.vi_moveCursor(MOVE_KEYS.RIGHT, moveAmount);
                }
                else if (name === "F") {
                    const text = this.currentLine.text.slice(0, this.state.col);
                    const moveAmount = getCountToNextChar(arg, text, { limit: count, reverse: true });
                    this.vi_moveCursor(MOVE_KEYS.LEFT, moveAmount);
                }
                else if (name === "t") {
                    const text = this.currentLine.text.slice(this.state.col + 1);
                    const moveAmount = getCountToNextChar(arg, text, { limit: count, stopBefore: true });
                    this.vi_moveCursor(MOVE_KEYS.RIGHT, moveAmount);
                }
                else if (name === "T") {
                    const text = this.currentLine.text.slice(0, this.state.col);
                    const moveAmount = getCountToNextChar(arg, text, { limit: count, reverse: true, stopBefore: true });
                    this.vi_moveCursor(MOVE_KEYS.LEFT, moveAmount);
                }
            }
        }
        else if (datatype === "insert") {
            const insKind = data.command;
            this.insertMap[insKind]();

            if ((insKind === "a" || insKind === "A") && !this.isAtLineTail()) {
                this.moveCursor(MOVE_KEYS.RIGHT);
            }
            this.vi_goInsert();

            (async () => {
                await new Promise<void>(resolve => {
                    this.state.vi_insertResolve = resolve;
                });
                // this.state.vi_insertResolveがどこかで呼び出されるまで以下を実行しない

                if (count >= 2 && ["o", "O"].includes(insKind)) {
                    this.state.vi_insertBuf.push(Editor.VI_ENTER);
                    this.insertNewLine();
                }
                for (let i = 0; i < count - 1; i++) {
                    this.vi_insertBuffer(this.state.vi_insertBuf);
                }
                if (count >= 2 && ["o", "O"].includes(insKind)) {
                    this.deleteRow(this.state.row);
                    this.moveCursor(MOVE_KEYS.UP);
                    this.moveCursorToLast();
                    this.moveCursor(MOVE_KEYS.RIGHT);
                }
                this.vi_moveCursor(MOVE_KEYS.LEFT);
                this.scrollWindow();
                this.render();
            })();
        }
        else if (datatype === "operator") {
            const ope = data.operator;
            const { lines } = this.state;
            const register: string[] = [];
            const range = getMotionRange(this.state, parseResult.value);
            if (!range) {
                return 0;
            }
            const isLinewise = data.motion.type === "linewise" || range.linewise;
            this.state.vi_yankLinewise = isLinewise;

            if (ope === "d") {
                if (isLinewise) {
                    lines.slice(range.start.row, range.end.row + 1).forEach(l => {
                        register.push(l.text);
                    });
                    const delCount = range.end.row - range.start.row + 1;
                    lines.splice(range.start.row, delCount);
                    if (this.state.row > range.start.row) {
                        this.state.row = range.start.row;
                    }
                    if (this.state.row > lines.length - 1) {
                        this.state.row = Math.max(0, lines.length - 1);
                    }
                    if (lines.length <= 0) {
                        this.insertRow(0, "");
                    }
                } else {
                    const text = this.currentLine.text;
                    const copied = text.slice(range.start.col, range.end.col + 1);
                    const distance = Math.abs(this.state.col - range.start.col);
                    if (this.state.col > range.start.col) {
                        for (let i = 0; i < distance; i++) this.moveCursorLeft();
                    }
                    else if (range.start.col > this.state.col) {
                        for (let i = 0; i < distance; i++) this.moveCursorRight();
                    }
                    register.push(copied);
                    this.currentLine.text = text.slice(0, range.start.col) + text.slice(range.end.col + 1);
                }
                writeClipboard(register.join("\n"));
            }
            else if (ope === "y") {
                if (isLinewise) {
                    lines.slice(range.start.row, range.end.row + 1).forEach(l => {
                        register.push(l.text);
                    });
                } else {
                    const text = this.currentLine.text;
                    const copied = text.slice(range.start.col, range.end.col + 1);
                    if (this.state.col > range.start.col) {
                        this.vi_moveCursor(MOVE_KEYS.LEFT, copied.length);
                    }
                    register.push(copied);
                }
                writeClipboard(register.join("\n"));
            }
        }
        else if (datatype === "put") {
            const isBefore = data.position === "before";
            readClipboard().then(text => {
                if (text === null) return;

                if (this.state.vi_yankLinewise) {
                    const lines = text.split("\n");
                    if (isBefore) {
                        this.insertNewLineCurrent();
                    } else {
                        this.insertNewLineNext();
                    }

                    for (let i = 0; i < count; i++) {
                        for (const line of lines) {
                            this.currentLine.text = line;
                            this.insertNewLineNext();
                        }
                    }
                    this.deleteRow(this.state.row);
                    this.state.row--;
                } else {
                    const line = this.currentLine;
                    const col = this.state.col;
                    const delta = isBefore ? 0 : 1;
                    const before = line.text.slice(0, col + delta);
                    const after = line.text.slice(col + delta);
                    this.currentLine.text = before + text + after;
                    this.vi_moveCursor(MOVE_KEYS.RIGHT, text.length);
                }
                this.scrollWindow();
                this.render();
            });
        }

        return 0;
    }

    // private vi_processInputClone(input: string[]): void {
    //     const [count, motion] = vi_getCountMotion(input.join(""));
    //     if (motion === null) return;
    //
    //     const fn = this.vi_normalCmdMap[motion as NormalCmd];
    //     if (isInsertionCmd(motion)) {
    //         fn();
    //         if (["a", "A"].includes(motion) && !this.isAtLineTail()) {
    //             this.moveCursor(MOVE_KEYS.RIGHT);
    //         }
    //         for (let i = 0; i < count; i++) {
    //             this.vi_insertBuffer(this.state.vi_insertBuf);
    //         }
    //         if (count >= 2 && ["o", "O"].includes(motion)) {
    //             this.deleteRow(this.state.row);
    //             this.moveCursor(MOVE_KEYS.UP);
    //             this.moveCursorToLast();
    //         }
    //         this.vi_moveCursor(MOVE_KEYS.LEFT);
    //     } else {
    //         for (let i = 0; i < count; i++) fn();
    //     }
    // }

    private vi_insertBuffer(buf: string[]): void {
        for (const token of buf) {
            if (token === Editor.VI_TAB) {
                this.indent();
            } else if (token === Editor.VI_ENTER) {
                this.insertNewLine();
            } else if (token === Editor.VI_BACKSPACE) {
                this.deleteChar();
            } else if (token === Editor.VI_DELETE) {
                if (this.isAtVeryTail()) return;
                this.moveCursor(MOVE_KEYS.RIGHT);
                this.deleteChar();
            } else {
                this.insertText(token);
            }
        }
    }

    private vi_goInsert(): void {
        this.state.vi_mode = "insert";
        this.state.vi_insertBuf = [];
    }

    private keyMap: Record<string, () => void> = {
        "ArrowLeft": () => {
            this.moveCursor(MOVE_KEYS.LEFT);
            this.state.vi_insertBuf = [];
        },
        "ArrowRight": () => {
            this.moveCursor(MOVE_KEYS.RIGHT);
            this.state.vi_insertBuf = [];
        },
        "ArrowUp": () => {
            this.moveCursor(MOVE_KEYS.UP);
            this.state.vi_insertBuf = [];
        },
        "ArrowDown": () => {
            this.moveCursor(MOVE_KEYS.DOWN);
            this.state.vi_insertBuf = [];
        },
        "Backspace": () => {
            this.deleteChar();
            this.state.vi_insertBuf.push(Editor.VI_BACKSPACE);
        },
        "Delete": () => {
            if (this.isAtVeryTail()) return;
            this.moveCursor(MOVE_KEYS.RIGHT);
            this.deleteChar();
            this.state.vi_insertBuf.push(Editor.VI_DELETE);
        },
        "Enter": () => {
            this.insertNewLine();
            this.state.vi_insertBuf.push(Editor.VI_ENTER);
        },
        "Tab": () => {
            this.indent();
            this.state.vi_insertBuf.push(Editor.VI_TAB);
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

    private vi_moveCursor(key: MoveKey, count = 1): void {
        for (let i = 0; i < count; i++) {
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

    private insertNewLineNext(): void {
        this.insertRow(this.state.row + 1, "");
        this.state.row += 1;
        this.state.col = 0;
        this.state.logicalWidth = 0;
    }

    private insertNewLineCurrent(): void {
        this.insertRow(this.state.row, "");
        this.state.col = 0;
        this.state.logicalWidth = 0;
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
        const len = this.state.lines.length;
        if (len === 0) {
            this.insertRow(0, "");
            this.state.col = 0;
            this.state.logicalWidth = 0;
            return;
        }
        if (this.state.row === row && row !== 0) {
            const prevLine = this.prevLine!;
            this.recalcColWidth(prevLine);
        } else {
            this.recalcColWidth(this.currentLine);
        }
    }

    private appendTextToLine(line: Line, text: string): void {
        line.text += text;
    }

    private insertTextInLine(line: Line, text: string): void {
        const before = line.text.slice(0, this.state.col);
        const after = line.text.slice(this.state.col);
        line.text = before + text + after;
    }

    private isAtLineTail(): boolean {
        return this.state.col === this.currentLine.size;
    }

    private isAtVeryTail(): boolean {
        return (
            this.state.row === this.state.lines.length - 1 &&
            this.isAtLineTail()
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
        this.recalcColWidth(prevLine);

        this.alignCursorToLeft(widthBeforeMove);
    }

    private moveCursorDown(): void {
        const widthBeforeMove = this.state.logicalWidth;
        const nextLine = this.nextLine as Line;
        this.state.row++;
        this.recalcColWidth(nextLine);

        this.alignCursorToLeft(widthBeforeMove);
    }

    private moveCursorToFirst(): void {
        this.state.col = 0;
        this.state.logicalWidth = 0;
    }
    private moveCursorToFirstNonWhitespace(): void {
        const line = this.currentLine;
        const start = getFirstNonWhitespaceCol(line.text);
        this.state.col = start;
        this.state.logicalWidth = calcLogicalWidth(line.text.slice(0, start));
    }

    private moveCursorToLast(): void {
        const line = this.currentLine;
        const end = line.text.length - 1;
        this.state.col = end;
        this.state.logicalWidth = calcLogicalWidth(line.text.slice(0, end));
    }

    private moveCursorToBOF(): void {
        this.state.row = 0;
        const firstLine = this.currentLine;
        const logicalWidth = Math.min(this.state.logicalWidth, calcLogicalWidth(firstLine.text));
        const col = logicalWidthToCol(logicalWidth, firstLine.text);
        this.state.col = col;
        this.state.logicalWidth = calcLogicalWidth(firstLine.text.slice(0, col));
    }

    private moveCursorToEOF(): void {
        this.state.row = this.state.lines.length - 1;
        const lastLine = this.currentLine;
        const logicalWidth = Math.min(this.state.logicalWidth, calcLogicalWidth(lastLine.text));
        const col = logicalWidthToCol(logicalWidth, lastLine.text);
        this.state.col = col;
        this.state.logicalWidth = calcLogicalWidth(lastLine.text.slice(0, col));
    }

    private recalcColWidth(destLine: Line): void {
        const logicalWidth = Math.min(this.state.logicalWidth, calcLogicalWidth(destLine.text));
        const col = logicalWidthToCol(logicalWidth, destLine.text);
        this.state.col = col;
        this.state.logicalWidth = calcLogicalWidth(destLine.text.slice(0, col));
    }

    // ------------------------------
    // | rendering
    // ------------------------------

    private render(): void {
        this.renderer.render(this.state);
    }
}
