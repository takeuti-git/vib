import type { EditorConfig } from "./config";
import type { Renderer } from "./renderer";
import { type EditorState, resetState } from "./state";
import { Line, getLines } from "./line";
import { isFunctionKey, MOVE_KEYS, type MoveKey } from "./keys";
import { hideElement, showElement } from "./dom";
import { LOGICAL_HALF_WIDTH, LOGICAL_FULL_WIDTH, calcLogicalWidth, logicalWidthToCol } from "./utils";
import { getCountToNextChar, getFirstNonWhitespaceCol, getMotionRange, moveForward, moveTail, moveBackward } from "./myvim/motion";
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

    private destElement: HTMLInputElement | HTMLTextAreaElement | null = null;

    private setDestElementValue(): void {
        if (!this.destElement) {
            console.error("destElement is null");
            return;
        }
        this.destElement.value = this.state.lines.map(l => l.text).join("\n");
        // 入力イベントを発火させる:
        // githubでは入力時にsessionStorageを操作することでPreviewを表示している
        this.destElement.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
        }));
    }

    private setupListeners(): void {
        let setDestElValueTimer: number = 0;

        document.addEventListener("keydown", (e) => {
            if (e.altKey && e.code === "KeyV") {
                e.preventDefault();
                const activeEl = document.activeElement;
                if (activeEl === this.input) return;

                if (
                    (activeEl instanceof HTMLInputElement) ||
                    (activeEl instanceof HTMLTextAreaElement)
                ) {
                    showElement(this.container);

                    this.destElement = activeEl;
                    this.input.focus();

                    resetState(this.state);
                    this.state.lines = getLines(activeEl.value);
                    this.render();
                }
                return;
            }

            if (e.altKey && e.code === "KeyQ") {
                if (this.container.style.visibility === "hidden") {
                    showElement(this.container);
                } else {
                    hideElement(this.container);
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
                this.setDestElementValue();

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
            if (isFunctionKey(key)) return; // fnキーは通常通り動作させるため早期リターン
            e.preventDefault();
            e.stopImmediatePropagation(); // サイト側のkeydownイベントを発火させない
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
                if (this.destElement) {
                    this.setDestElementValue();
                    this.destElement.focus();
                }
                return;
            }

            this.input.value = "";
            if (key === "Escape" || (key === "[" && e.ctrlKey)) {
                this.state.vi_mode = "normal";
                this.state.vi_cursor = "full";
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
                    this.setStatusMsg("too long");
                    this.state.vi_cmd = [];
                    return;
                }

                const result = this.vi_processInput(this.state.vi_cmd);
                this.scrollWindow();
                this.render();

                if (result === 0) {
                    this.state.vi_cmd = [];
                }
                else if (result === 1) {
                    this.setStatusMsg("unknown cmd");
                    this.state.vi_cmd = [];
                    return;
                }
            }
            else if (this.state.vi_mode === "insert") {
                this.processKeypress(e);
                this.scrollWindow();
                this.render();
            }
            else if (this.state.vi_mode === "replace") {
                this.processKeypress(e, { replace: true });
                this.scrollWindow();
                this.render();
            }

            if (setDestElValueTimer) {
                clearTimeout(setDestElValueTimer);
            }
            setDestElValueTimer = setTimeout(this.setDestElementValue.bind(this), 300);
        });
    }

    // ------------------------------
    // | processing basic inputs
    // ------------------------------

    // remaining = ["H","L","%",]
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
        "gg": () => this.moveCursorToBOF(),
        "G": () => this.moveCursorToEOF(),
        "-": () => {
            this.vi_moveCursor(MOVE_KEYS.UP);
            this.moveCursorToFirstNonWhitespace();
        },
        "+": () => {
            this.vi_moveCursor(MOVE_KEYS.DOWN);
            this.moveCursorToFirstNonWhitespace();
        },
        "w": () => {
            const { distance } = moveForward(this.state, "word");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
        "W": () => {
            const { distance } = moveForward(this.state, "WORD");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
        "b": () => {
            // const distance = getDistanceWordBackward(this.state);
            const { distance } = moveBackward(this.state, "word");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.LEFT);
        },
        "B": () => {
            // const distance = getDistanceWORDBackward(this.state);
            const { distance } = moveBackward(this.state, "WORD");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.LEFT);
        },
        "e": () => {
            const { distance } = moveTail(this.state, "word");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
        "E": () => {
            const { distance } = moveTail(this.state, "WORD");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
    };

    private insertMap: Record<InsertCommand, () => void> = {
        i: () => {/* ここでは何もしない */},
        a: () => {/* ここでは何もしない */},
        I: () => this.moveCursorToFirstNonWhitespace(),
        A: () => this.moveCursorToLast(),
        o: () => this.insertNewLineNext(),
        O: () => this.insertNewLineCurrent(),
    };

    /**
     * - 0: complete
     * - 1: doesn't exists
     * - 2: exists but incomplete
     * */
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
                if (!fn) {
                    console.log(motion.name + " is not mapped yet");
                    return 0;
                }
                for (let i = 0; i < count; i++) fn();
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

                    for (let i = 0; i < count - 1; i++) {
                        this.vi_insertBuffer(this.state.vi_insertBuf);
                    }

                    this.deleteRow(this.state.row);
                    this.moveCursor(MOVE_KEYS.UP);
                    this.moveCursorToLast();
                    this.moveCursor(MOVE_KEYS.RIGHT);
                } else {
                    for (let i = 0; i < count - 1; i++) {
                        this.vi_insertBuffer(this.state.vi_insertBuf);
                    }
                }
                this.vi_moveCursor(MOVE_KEYS.LEFT);
                this.scrollWindow();
                this.render();
                this.setDestElementValue();
            })();
        }
        else if (datatype === "operator") {
            const range = getMotionRange(this.state, parseResult.value);
            if (!range) {
                return 0;
            }
            const { operator } = data;
            const { lines } = this.state;
            const clipboardBuf: string[] = [];
            const isLinewise = data.motion.type === "linewise" || range.linewise;
            this.state.vi_yankLinewise = isLinewise;

            if (operator === "d" || operator === "c") {
                if (isLinewise) {
                    lines.slice(range.start.row, range.end.row + 1).forEach(l => {
                        clipboardBuf.push(l.text);
                    });
                    const delCount = range.end.row - range.start.row + 1;
                    lines.splice(range.start.row, delCount);

                    const row = Math.min(range.start.row, lines.length - 1);
                    this.state.row = Math.max(0, row);

                    if (operator === "c") {
                        if (range.start.row > this.state.row) {
                            this.insertNewLineNext();
                        } else {
                            this.insertNewLineCurrent();
                        }
                    }
                    else if (lines.length <= 0) {
                        // 全ての行が削除された場合のfallback
                        this.insertRow(0, "");
                    }
                } else {
                    // カーソル位置を対象範囲の先頭に移動する
                    while (this.state.row > range.start.row) {
                        this.moveCursorUp();
                    }
                    while (this.state.row < range.start.row) {
                        this.moveCursorDown();
                    }
                    while (this.state.col < range.start.col) {
                        this.moveCursor(MOVE_KEYS.RIGHT);
                    }
                    while (this.state.col > range.start.col) {
                        this.moveCursor(MOVE_KEYS.LEFT);
                    }

                    if (range.start.row === range.end.row) {
                        // 同一行内の操作
                        const text = this.currentLine.text;
                        const copied = text.slice(range.start.col, range.end.col + 1);
                        const distance = Math.abs(this.state.col - range.start.col);
                        if (this.state.col > range.start.col) {
                            for (let i = 0; i < distance; i++) this.moveCursorLeft();
                        }
                        else if (range.start.col > this.state.col) {
                            for (let i = 0; i < distance; i++) this.moveCursorRight();
                        }
                        clipboardBuf.push(copied);
                        this.currentLine.text = text.slice(0, range.start.col) + text.slice(range.end.col + 1);
                    } else {
                        // 複数行の操作
                        const startRow = this.state.lines[range.start.row];
                        if (!startRow) throw new Error("startRow is undefined");
                        const endRow = this.state.lines[range.end.row];
                        if (!endRow) throw new Error("endRow is undefined");

                        // あらかじめ取得できる文字列
                        const startRowText = startRow.text.slice(0, range.start.col);
                        const endRowText = endRow.text.slice(range.end.col + 1);
                        const joinedText = startRowText + endRowText;

                        // 開始行のスライスヤンク
                        clipboardBuf.push(startRow.text.slice(range.start.col));

                        // ヤンク用ループ
                        for (let i = range.start.row + 1; i < range.end.row; i++) {
                            // 完全行のみを対象にしたループ
                            const line = this.state.lines[i];
                            if (!line) throw new Error("line for yank is undefined");
                            clipboardBuf.push(line.text);
                        }

                        // 最終行のスライスヤンク
                        clipboardBuf.push(endRow.text.slice(0, range.end.col + 1));

                        // 行単位で削除
                        const delCount = range.end.row - range.start.row;
                        for (let i = 0; i < delCount; i++) {
                            this.deleteRow(range.start.row + 1);
                        }

                        this.currentLine.text = joinedText;
                    }
                }
                if (operator === "c") {
                    this.vi_goInsert();
                }
                writeClipboard(clipboardBuf.join("\n"));
            }
            else if (operator === "y") {
                if (isLinewise) {
                    lines.slice(range.start.row, range.end.row + 1).forEach(l => {
                        clipboardBuf.push(l.text);
                    });
                } else {
                    // カーソル位置を対象範囲の先頭に移動する
                    while (this.state.row > range.start.row) {
                        this.moveCursorUp();
                    }
                    while (this.state.row < range.start.row) {
                        this.moveCursorDown();
                    }
                    while (this.state.col < range.start.col) {
                        this.moveCursor(MOVE_KEYS.RIGHT);
                    }
                    while (this.state.col > range.start.col) {
                        this.moveCursor(MOVE_KEYS.LEFT);
                    }

                    if (range.start.row === range.end.row) {
                        // 単一行の操作
                        const text = this.currentLine.text;
                        const copied = text.slice(range.start.col, range.end.col + 1);
                        const distance = Math.abs(this.state.col - range.start.col);
                        if (this.state.col > range.start.col) {
                            for (let i = 0; i < distance; i++) this.moveCursorLeft();
                        }
                        else if (range.start.col > this.state.col) {
                            for (let i = 0; i < distance; i++) this.moveCursorRight();
                        }
                        clipboardBuf.push(copied);
                    } else {
                        // 複数行の操作
                        const startRow = this.state.lines[range.start.row];
                        if (!startRow) throw new Error("startRow is undefined");
                        const endRow = this.state.lines[range.end.row];
                        if (!endRow) throw new Error("endRow is undefined");

                        // 開始行のスライスヤンク
                        clipboardBuf.push(startRow.text.slice(range.start.col));

                        for (let i = range.start.row + 1; i < range.end.row; i++) {
                            // start/endを含まない,あいだの行単位のヤンク
                            const line = this.state.lines[i];
                            if (!line) throw new Error("line is undefined");
                            clipboardBuf.push(line.text);
                        }

                        // 終了行のスライスヤンク
                        clipboardBuf.push(endRow.text.slice(0, range.end.col + 1));
                    }
                }
                writeClipboard(clipboardBuf.join("\n"));
            }
        }
        else if (datatype === "put") {
            const isBefore = data.position === "before";
            readClipboard().then(text => {
                if (text === null) return;

                const lines = text.split("\n");
                if (this.state.vi_yankLinewise) {
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
                    this.deleteRow(this.state.row); // ループで増えすぎた行を削除
                    this.state.row--;
                } else {
                    const delta = isBefore ? 0 : 1; // p/Pの1文字分のずれ
                    const currLine = this.currentLine;
                    const currCol = this.state.col;
                    if (lines.length === 1) {
                        // 改行が含まれない文字列をペーストする
                        const before = currLine.text.slice(0, currCol + delta);
                        const after = currLine.text.slice(currCol + delta);
                        currLine.text = before + text + after;
                        this.vi_moveCursor(MOVE_KEYS.RIGHT, text.length);
                    } else {
                        // 改行を含む文字列をペーストする
                        const firstClipText = lines[0] as string;
                        const lastClipText = lines[lines.length - 1] as string;

                        const currLineTail = currLine.text.slice(currCol + delta);

                        // 最初と最後の行の文字列は先に処理
                        currLine.text = currLine.text.slice(0, currCol + delta) + firstClipText;
                        const lastLineText = lastClipText + currLineTail;
                        this.insertRow(this.state.row + 1, lastLineText);
                        this.vi_moveCursor(MOVE_KEYS.RIGHT, delta); // 仕様上,1文字だけ動くことがある

                        const newLineCount = lines.length - 1;
                        if (newLineCount >= 2) {
                            // クリップボードに改行が2回以上あるとき、完全新規行に文字列を代入
                            for (let i = 0; i < newLineCount - 1; i++) {
                                const row = this.state.row + 1 + i;
                                const text = lines[i + 1];
                                if (text === undefined) throw new Error("clipboard text is undefined");
                                this.insertRow(row, text);
                            }
                        }
                    }
                }
                this.scrollWindow();
                this.render();
            });
        }
        else if (datatype === "join") {
            for (let i = 0; i < count; i++) {
                const nextLine = this.nextLine;
                if (!nextLine) break;
                this.appendTextToLine(this.currentLine, " ");
                this.moveCursorToLast();

                const appending = nextLine.text.trimStart();
                this.appendTextToLine(this.currentLine, appending);
                this.deleteRow(this.state.row + 1);
            }
        }
        else if (datatype === "replace") {
            const kind = data.mode.kind;
            if (kind === "single") {
                const arg = data.mode.char;
                const linetext = this.currentLine.text;
                const text = linetext.slice(this.state.col);

                // countが右側の文字数より多いなら実行しない
                if (count > text.length) return 0;

                const before = linetext.slice(0, this.state.col);
                const after = text.slice(count);
                const replaecd = before + arg.repeat(count) + after;
                this.currentLine.text = replaecd;
                for (let i = 0; i < count - 1; i++) this.moveCursorRight();
            }
            else if (kind === "continuous") {
                // 置き換え処理はsetupListenersで行う
                this.state.vi_mode = "replace";
                this.state.vi_cursor = "under";
            }
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
        this.state.vi_cursor = "vertical";
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

    private processKeypress(e: KeyboardEvent, { replace = false } = {}): void {
        const key = e.key;

        const action = this.keyMap[key];

        if (action) {
            action();
        } else {
            if (key.length > 1) return;
            this.insertText(key, { replace });
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

    private insertText(text: string, { replace = false } = {}): void {
        const currLine = this.currentLine;
        if (replace) {
            const before = currLine.text.slice(0, this.state.col);
            const after = currLine.text.slice(this.state.col + 1);
            currLine.text = before + text + after;

        } else if (this.state.col >= currLine.size) {
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
        this.recalcColWidth(firstLine);
    }

    private moveCursorToEOF(): void {
        this.state.row = this.state.lines.length - 1;
        const lastLine = this.currentLine;
        this.recalcColWidth(lastLine);
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

    private setStatusMsg(text: string): void {
        this.renderer.setStatusMsg(this.state, text);
    }
}
