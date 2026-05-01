import { getFullScreenRows, getHalfScreenRows, type EditorConfig } from "./config";
import type { Renderer } from "./renderer";
import { type EditorState, resetState } from "./state";
import { Line, getLines, joinLines } from "./line";
import { toInputToken, isFunctionKey, MOVE_KEYS, type MoveKey, isSpecialKey } from "./keys";
import { hideElement, setElementFontsize, showElement } from "./dom";
import { LOGICAL_HALF_WIDTH, addFirstWhitespace, calcLogicalWidth, getCountUntilNonWhitespace, logicalWidthToCol, removeFirstWhitespace } from "./utils";
import {
    getCountToNextChar,
    getMotionRange,
    moveForward,
    moveTail,
    moveBackward,
} from "./myvim/motionRange";
import { parseNormalInput, parseVisualInput, ParseStatus } from "./myvim/parser";
import { readClipboard, writeClipboard } from "./clipboard";
import {
    FIND_COMMAND_OPTIONS,
    FIND_REPEAT_OPTIONS,
    type FindMoveOptions,
} from "./myvim/findCommand";
import { createDiff, toRange } from "./undo";
import type { ExclusivePos, InclusivePos, InclusiveRange, TextRange } from "./types/motion";
import { InsertCommand } from "./myvim/insert";
import { ScrollCommand } from "./myvim/scroll";
import { MotionType, type MotionContext, type MotionName } from "./myvim/motion";
import { OperatorName } from "./myvim/operator";
import { NormalCmdType } from "./myvim/normal";
import { VisualCmdType } from "./myvim/visual";
import { isValidMacroChar, type MacroChar } from "./myvim/macro";

function toExclusiveTextRange(start: InclusivePos, end: InclusivePos, linewise: boolean): TextRange {
    if (linewise) {
        return {
            begin: { row: start.row,   col: start.col },
            end:   { row: end.row + 1, col: end.col },
        };
    } else {
        return {
            begin: { row: start.row, col: start.col },
            end:   { row: end.row,   col: end.col + 1 },
        };
    }
}

function toInclusiveRange(begin: InclusivePos, end: ExclusivePos, linewise: boolean): InclusiveRange {
    if (linewise) {
        return {
            first: { row: begin.row, col: begin.col },
            last: { row: end.row - 1, col: end.col },
        };
    } else {
        return {
            first: { row: begin.row, col: begin.col },
            last: { row: end.row, col: end.col - 1 },
        };
    }
}

function swapCase(text: string): string {
    return [...text].map((ch) => (
        ch !== ch.toLowerCase() ? ch.toLowerCase() : ch.toUpperCase()
    )).join("");
}

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

    private setDestElement(el: HTMLInputElement | HTMLTextAreaElement): boolean {
        const isSame = el === this.destElement;
        this.destElement = el;
        return isSame;
    }

    private syncElementValue(): void {
        if (!this.destElement) {
            return;
        }
        this.destElement.value = joinLines(this.state.lines);
        // 入力イベントを発火させる:
        // githubでは入力時にsessionStorageを操作することでPreviewを表示している
        this.destElement.dispatchEvent(
            new InputEvent("input", {
                bubbles: true,
                cancelable: true,
            }),
        );
    }

    private tryFocusDestElement(): void {
        if (this.destElement) {
            this.destElement.focus();
            this.syncElementValue();
        }
    }

    private setupListeners(): void {
        document.addEventListener("keydown", this.handleDocumentKeydown);

        window.addEventListener("resize", this.handleResizeWindow);

        this.canvas.addEventListener("click", () => {
            this.input.focus();
            this.render();
        });
        this.canvas.addEventListener("wheel", this.handleCanvasWheel);
        this.canvas.addEventListener("mousedown", this.handleCanvasMousedown);

        this.input.addEventListener("compositionstart", this.handleCompositionStart);
        this.input.addEventListener("compositionend", this.handleCompositionEnd);
        this.input.addEventListener("keydown", this.handleEditorKeydown);
    }

    private updateCanvas(): void {
        this.renderer.applyConfig();
        this.render();
    }

    private resetCmd(): void {
        this.state.vi_cmd = [];
    }

    private activateExternalInput(el: HTMLInputElement | HTMLTextAreaElement): void {
        showElement(this.container);

        const isSameElement = this.setDestElement(el);
        this.input.focus();

        if (!isSameElement) {
            resetState(this.state, this.config);
        }
        // getLinesの仕様上、文字列が空でも必ず1要素の配列になる
        const newLines = getLines(el.value);
        if (newLines.length === 0)
            throw new Error("getLines must return array within at least one element");

        this.state.lines = newLines;

        if (!isSameElement) {
            // 元の文字列の末尾まで移動する
            this.moveCursorToEOF();
            this.moveCursorToLast();
        } else {
            this.clampCursor();
        }
        this.scrollWindow();
        this.render();
    }

    private handleDocumentKeydown = (e: KeyboardEvent): void => {
        if (e.altKey && e.code === "KeyV") {
            e.preventDefault();
            e.stopImmediatePropagation();
            const activeEl = document.activeElement;
            if (activeEl === this.input) return;

            if (
                activeEl instanceof HTMLInputElement ||
                activeEl instanceof HTMLTextAreaElement
            ) {
                this.activateExternalInput(activeEl);
            } else {
                this.input.focus();
            }
            return;
        }
        if (e.altKey && e.code === "KeyQ") {
            this.toggleEditorVisibility();
            return;
        }
    };

    private toggleEditorVisibility(): void {
        if (this.container.style.visibility === "hidden") {
            showElement(this.container);
        } else {
            hideElement(this.container);
        }
    }

    private elementValueUpdateTimer: number = 0;
    private scheduleElementValueUpdate = (): void => {
        if (this.elementValueUpdateTimer) {
            clearTimeout(this.elementValueUpdateTimer);
        }
        this.elementValueUpdateTimer = setTimeout(() => {
            this.syncElementValue();
        }, 300);
    };

    private windowResizeTimer: number = 0;
    private handleResizeWindow = (): void => {
        // ページの拡大率が変化した際に呼び出す
        if (this.windowResizeTimer) {
            clearTimeout(this.windowResizeTimer);
        }
        this.windowResizeTimer = setTimeout(() => {
            this.updateCanvas();
        }, 500);
    };

    private handleCompositionStart = (): void => {
        // 日本語変換が始まったとき
        this.input.style.zIndex = "99999";
    };

    private handleCompositionEnd = (): void => {
        // 日本語変換が終わったとき
        if (this.state.vi_state.mode === "insert") {
            const value = this.input.value;
            this.insertText(value);
            this.scrollWindow();
            this.render();
            this.syncElementValue();

            if (value !== "") {
                this.state.vi_insertBuf.push(value);
            }
        }
        this.input.value = "";
        this.input.style.zIndex = "-1";
    };

    private handleCanvasWheel = (e: WheelEvent): void => {
        if (e.deltaY < 0) {
            // up
            for (let i = 0; i < 3; i++) {
                this.scrollUpWithCursor();
            }
        } else if (e.deltaY > 0) {
            // down
            for (let i = 0; i < 3; i++) {
                this.scrollDownWithCursor();
            }
        } else if (e.deltaX > 0) {
            // right
            for (let i = 0; i < 6; i++) {
                this.scrollRightWithCursor();
            }
        } else if (e.deltaX < 0) {
            // left
            for (let i = 0; i < 6; i++) {
                this.scrollLeftWithCursor();
            }
        }
        this.scrollWindow();
        this.render();
    };

    /** Canvas要素内でのクリック座標を用いてカーソルを移動する */
    private handleCanvasMousedown = (e: MouseEvent): void => {
        const charWidth = this.config.baseFontSize / 2;
        const lineNumberWidth = this.lineNumberCols * charWidth;
        const lineHeight = this.config.baseFontSize + this.config.lineHeightPadding;

        const clickX = e.offsetX - lineNumberWidth;
        const clickY = e.offsetY;

        const targetRow = Math.floor(clickY / lineHeight) + this.state.rowoff;

        const targetLine = this.state.lines[targetRow] ?? this.state.lines[this.state.lines.length - 1] as Line;
        const startCol = logicalWidthToCol(this.state.logicaloff, targetLine.text);
        const hiddenTextWidth = calcLogicalWidth(targetLine.text.slice(0, startCol));
        const cursorLogiWidth = (
            Math.floor(clickX / charWidth) + hiddenTextWidth
            + (this.state.logicaloff !== hiddenTextWidth ? 1 : 0) // 全角文字が画面間にある状態のずれを解決する
        );
        const targetCol = logicalWidthToCol(cursorLogiWidth, targetLine.text);

        this.state.row = targetRow;
        this.state.col = targetCol;
        this.state.logicalWidth = calcLogicalWidth(targetLine.text.slice(0, targetCol));
        this.state.preferredWidth = cursorLogiWidth;
        this.clampCursor(); // 存在する行を超えたクリックに対応
        this.scrollWindow();
        this.render();
    };

    private handleEditorKeydown = (e: KeyboardEvent): void => {
        if (isFunctionKey(e.key)) return; // fnキーは通常通り動作させるため早期リターン
        e.preventDefault();
        e.stopImmediatePropagation(); // サイト側のkeydownイベントを発火させない
        if (e.isComposing) return;

        if (e.shiftKey) {
            const resize = this.resizeMap[e.key];
            if (resize) {
                resize();
                this.updateCanvas();
                return;
            }
        }

        if (e.altKey && e.code === "KeyV") {
            this.tryFocusDestElement();
            return;
        }

        if (e.altKey && e.code === "KeyQ") {
            this.tryFocusDestElement();
            this.toggleEditorVisibility();
            return;
        }

        // フォントサイズの拡大
        if (e.ctrlKey && e.code === "Equal") {
            this.increaseFontsize();
            return;
        }
        // フォントサイズの縮小
        if (e.ctrlKey && e.code === "Minus") {
            this.decreaseFontsize();
            return;
        }

        this.input.value = "";

        if (isSpecialKey(e.key)) return;

        const input = toInputToken(e.key, e.ctrlKey);
        if (this.state.vi_macroRecording) {
            this.state.vi_macroTable[this.state.vi_macroRecording].push(input);
        }
        this.vi_executeKeypress(input);

        this.scheduleElementValueUpdate();
    };

    private vi_executeKeypress(input: string): void {
        if (input === "Escape") {
            this.vi_goNormal();
            this.render();

            const newText = joinLines(this.state.lines);
            this.saveDiff(this.state.lastSnapshot, newText);
            return;
        }

        // processing
        if (this.state.vi_state.mode === "normal" || this.state.vi_state.mode === "visual") {
            if (input.length !== 1 && input !== "Enter" && !input.startsWith("<")) {
                return;
            }
            this.state.vi_cmd.push(input);

            if (this.state.vi_cmd.length > 6) {
                this.resetCmd();
                this.setStatusMsg("too long");
                return;
            }
            const result = (
                this.state.vi_state.mode === "normal"
                ? this.vi_executeNormal(this.state.vi_cmd)
                : this.vi_executeVisual(this.state.vi_cmd)
            );
            this.executeResult(result);

        } else if (this.state.vi_state.mode === "insert") {
            this.processKeypress(input);
            this.scrollWindow();
            this.render();

        } else if (this.state.vi_state.mode === "replace") {
            this.processKeypress(input, { replace: true });
            this.scrollWindow();
            this.render();
        }

        if (this.state.vi_macroCallback) {
            // 再帰無限ループを防ぐため関数の参照を保持し元の値は削除、その後呼び出す
            const macroCallbackTemp = this.state.vi_macroCallback;
            this.state.vi_macroCallback = null;
            macroCallbackTemp();
        }
    }

    private executeResult(result: 0 | 1 | 2): void {
        if (result === 1) {
            this.setStatusMsg("unknown cmd");
            this.resetCmd();
            return;
        }

        if (result === 2) {
            this.render();
            return;
        }

        if (result === 0) {
            this.scrollWindow();
            this.render();
            this.resetCmd(); // render後にcmdを初期化

            const newText = joinLines(this.state.lines);
            this.saveDiff(this.state.lastSnapshot, newText);
        }
    }

    private resizeMap: Record<string, () => void> = {
        ArrowLeft: () => {
            this.config.screencols = Math.min(this.config.screencols + 2, 80);
        },
        ArrowRight: () => {
            this.config.screencols = Math.max(
                2 + this.lineNumberCols,
                this.config.screencols - 2,
            );
        },
        ArrowUp: () => {
            this.config.screenrows = Math.min(this.config.screenrows + 1, 40);
            this.state.vi_scrollAmount = getHalfScreenRows(this.config);
        },
        ArrowDown: () => {
            this.config.screenrows = Math.max(
                1 + this.config.statusBarHeight,
                this.config.screenrows - 1,
            );
            this.state.vi_scrollAmount = getHalfScreenRows(this.config);
        },
    };

    private getCurrentHeight = () => this.config.screenrows * (this.config.baseFontSize + this.config.lineHeightPadding);
    private getCurrentWidth = () => this.config.screencols * this.config.baseFontSize / 2;

    private increaseFontsize(): void {
        const oldHeight = this.getCurrentHeight();
        const oldWidth = this.getCurrentWidth();

        this.config.baseFontSize += 2;
        while (this.getCurrentHeight() > oldHeight) {
            this.config.screenrows--;
        }
        while (this.getCurrentWidth() > oldWidth) {
            this.config.screencols--;
        }

        setElementFontsize(this.input, this.config.baseFontSize);
        this.renderer.applyConfig();
        this.render();
    }

    private decreaseFontsize(): void {
        const oldHeight = this.getCurrentHeight();
        const oldWidth = this.getCurrentWidth();

        this.config.baseFontSize -= 2;
        while (this.getCurrentHeight() < oldHeight) {
            this.config.screenrows++;
        }
        while (this.getCurrentWidth() < oldWidth) {
            this.config.screencols++;
        }

        setElementFontsize(this.input, this.config.baseFontSize);
        this.renderer.applyConfig();
        this.render();
}

    // ------------------------------
    // | processing basic inputs
    // ------------------------------

    private motionMap: Record<MotionName, () => void> = {
        "left": () => this.vi_moveCursor(MOVE_KEYS.LEFT),
        "right": () => this.vi_moveCursor(MOVE_KEYS.RIGHT),
        "down": () => this.vi_moveCursor(MOVE_KEYS.DOWN),
        "up": () => this.vi_moveCursor(MOVE_KEYS.UP),
        "first": () => this.moveCursorToFirst(),
        "firstChar": () => this.moveCursorToFirstNonWhitespace(),
        "last": () => {
            this.moveCursorToLast();
            this.setMaxPreferredWidth();
        },
        "firstLine": () => this.moveCursorToBOF(),
        "lastLine": () => this.moveCursorToEOF(),
        "firstCharPrevLine": () => {
            this.vi_moveCursor(MOVE_KEYS.UP);
            this.moveCursorToFirstNonWhitespace();
        },
        "firstCharNextLine": () => {
            this.vi_moveCursor(MOVE_KEYS.DOWN);
            this.moveCursorToFirstNonWhitespace();
        },
        "word_forward": () => {
            const { distance } = moveForward(this.state, "word");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
        "WORD_forward": () => {
            const { distance } = moveForward(this.state, "WORD");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
        "word_backward": () => {
            const { distance } = moveBackward(this.state, "word");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.LEFT);
        },
        "WORD_backward": () => {
            const { distance } = moveBackward(this.state, "WORD");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.LEFT);
        },
        "word_tail": () => {
            const { distance } = moveTail(this.state, "word");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
        "WORD_tail": () => {
            const { distance } = moveTail(this.state, "WORD");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.RIGHT);
        },
    };

    private insertMap: Record<InsertCommand, () => void> = {
        "INSERT": () => {
            /* ここでは何もしない */
        },
        "APPEND": () => {
            /* ここでは何もしない */
        },
        "INSERT_FIRST": () => {
            this.moveCursorToFirstNonWhitespace();
        },
        "APPEND_LAST": () => {
            this.moveCursorToLast();
        },
        "NEXTLINE": () => {
            this.insertNewLineNext();
        },
        "CURRENTLINE": () => {
            this.insertNewLineCurrent();
        },
    };

    private vi_executeMotion(motion: MotionContext, count: number): void {
        const motiontype = motion.type;
        if (motiontype === "char") {
            const fn = this.motionMap[motion.name];
            if (!fn) {
                this.setStatusMsg(`${motion.name} is not mapped`);
                return;
            }
            for (let i = 0; i < count; i++) fn();

        } else if (motiontype === "find") {
            this.setLastFindMotion(motion);
            const { name, arg } = motion;

            // 初回のfindMotionは静的にoptionsを取得
            const options = FIND_COMMAND_OPTIONS[name];
            this.moveUntilNextChar(arg, { limit: count, ...options });
        }
    }

    private vi_executeInsertImmediately(insertKind: InsertCommand, count: number): void {
        this.insertMap[insertKind]();
        if (
            (insertKind === InsertCommand.APPEND || insertKind === InsertCommand.APPEND_LAST) && !this.isAtLineTail()) {
            this.moveCursor(MOVE_KEYS.RIGHT);
        }
        if (
            count >= 2 &&
            (insertKind === InsertCommand.NEXTLINE || insertKind === InsertCommand.CURRENTLINE)
        ) {
            for (let i = 0; i < count; i++) {
                this.vi_insertBuffer(this.state.vi_insertBuf);
                if (i !== count -1) this.insertNewLine();
            }
        } else {
            for (let i = 0; i < count; i++) {
                this.vi_insertBuffer(this.state.vi_insertBuf);
            }
        }
        this.vi_moveCursor(MOVE_KEYS.LEFT);
        this.scrollWindow();
        this.render();
        this.syncElementValue();
    }

    private vi_executeInsert(insertKind: InsertCommand, count: number): void {
        this.insertMap[insertKind]();

        this.disableSaveDiff = true; // insertへの移行入力は差分として扱わない

        if (
            (insertKind === InsertCommand.APPEND || insertKind === InsertCommand.APPEND_LAST) &&
            !this.isAtLineTail()
        ) {
            this.moveCursor(MOVE_KEYS.RIGHT);
        }
        this.vi_goInsert();

        (async () => {
            await new Promise<void>((resolve) => {
                this.state.vi_insertResolve = resolve;
            });
            // this.state.vi_insertResolveがどこかで呼び出されるまで以下を実行しない

            if (
                count >= 2 &&
                (insertKind === InsertCommand.NEXTLINE || insertKind === InsertCommand.CURRENTLINE)
            ) {
                const insertBufLines = [Editor.VI_ENTER, ...this.state.vi_insertBuf];
                this.moveCursorRight(); // 行末を1文字超えた地点に移動する
                for (let i = 0; i < count - 1; i++) {
                    this.vi_insertBuffer(insertBufLines);
                }
                this.vi_moveCursor(MOVE_KEYS.LEFT);
            } else {
                this.moveCursorRight();
                for (let i = 0; i < count - 1; i++) {
                    this.vi_insertBuffer(this.state.vi_insertBuf);
                }
                this.vi_moveCursor(MOVE_KEYS.LEFT);
            }
            this.scrollWindow();
            this.render();
            this.syncElementValue();
            this.state.vi_lastCmd = { type: "insert", count, insertKind };
        })();
    }

    /** 返り値: 文字列, 削除/変更/ヤンクの対象を改行コードで連結 */
    private vi_executeOperator(
        {
            operator, range, linewise, writeRegister = true
        }: {
            operator: OperatorName, range: TextRange, linewise: boolean, writeRegister?: boolean
        }
    ): string {
        const { lines } = this.state;
        const clipboardBuf: string[] = [];
        this.state.vi_yankLinewise = linewise;

        if (operator === OperatorName.DELETE || operator === OperatorName.CHANGE) {
            if (linewise) {
                lines.slice(range.begin.row, range.end.row).forEach((l) => {
                    clipboardBuf.push(l.text);
                });
                const delCount = range.end.row - range.begin.row;
                lines.splice(range.begin.row, delCount);

                const row = Math.min(range.begin.row, lines.length - 1);
                this.state.row = Math.max(0, row);

                if (operator === OperatorName.CHANGE) {
                    if (range.begin.row > this.state.row) {
                        this.insertNewLineNext();
                    } else {
                        this.insertNewLineCurrent();
                    }
                } else if (lines.length <= 0) {
                    // 全ての行が削除された場合のfallback
                    this.insertRow(0, "");
                }
                if (this.state.logicalWidth >= calcLogicalWidth(this.currentLine.text)) {
                    this.moveCursorToLast();
                }
            } else {
                // カーソル位置を対象範囲の先頭に移動する
                this.moveCursorToPos(range.begin.row, range.begin.col);

                if (range.begin.row === range.end.row) {
                    // 同一行内の操作
                    const text = this.currentLine.text;
                    const copied = text.slice(range.begin.col, range.end.col);
                    clipboardBuf.push(copied);
                    const newText =
                        text.slice(0, range.begin.col) + text.slice(range.end.col);
                    this.currentLine.text = newText;
                } else {
                    // 複数行の操作
                    const beginRow = this.state.lines[range.begin.row];
                    if (!beginRow) throw new Error("beginRow is undefined");
                    const endRow = this.state.lines[range.end.row];
                    if (!endRow) throw new Error("endRow is undefined");

                    // あらかじめ取得できる文字列
                    const beginRowText = beginRow.text.slice(0, range.begin.col);
                    const endRowText = endRow.text.slice(range.end.col);
                    const joinedText = beginRowText + endRowText;

                    // 開始行のスライスヤンク
                    clipboardBuf.push(beginRow.text.slice(range.begin.col));

                    // ヤンク用ループ
                    for (let i = range.begin.row + 1; i < range.end.row; i++) {
                        // 完全行のみを対象にしたループ
                        const line = this.state.lines[i];
                        if (!line) throw new Error("line for yank is undefined");
                        clipboardBuf.push(line.text);
                    }

                    // 最終行のスライスヤンク
                    clipboardBuf.push(endRow.text.slice(0, range.end.col));

                    // 行単位で削除
                    const delCount = range.end.row - range.begin.row;
                    for (let i = 0; i < delCount; i++) {
                        this.deleteRow(range.begin.row + 1);
                    }

                    this.currentLine.text = joinedText;
                }
            }
            if (
                operator === OperatorName.DELETE &&
                this.state.col >= this.currentLine.size &&
                this.state.col !== 0
            ) {
                // 文字削除でカーソルが行からはみ出た時
                this.moveCursor(MOVE_KEYS.LEFT);
            }
            const savedText = clipboardBuf.join("\n");
            if (writeRegister && savedText !== "") {
                writeClipboard(savedText);
            }
            return savedText;

        } else if (operator === OperatorName.YANK) {
            if (linewise) {
                lines.slice(range.begin.row, range.end.row).forEach((l) => {
                    clipboardBuf.push(l.text);
                });
            } else {
                // カーソル位置を対象範囲の先頭に移動する
                this.moveCursorToPos(range.begin.row, range.begin.col);

                if (range.begin.row === range.end.row) {
                    // 単一行内の操作
                    const text = this.currentLine.text;
                    const copied = text.slice(range.begin.col, range.end.col);
                    clipboardBuf.push(copied);
                } else {
                    // 複数行の操作
                    const beginRow = this.state.lines[range.begin.row];
                    if (!beginRow) throw new Error("beginRow is undefined");
                    const endRow = this.state.lines[range.end.row];
                    if (!endRow) throw new Error("endRow is undefined");

                    // 開始行のスライスヤンク
                    clipboardBuf.push(beginRow.text.slice(range.begin.col));

                    for (let i = range.begin.row + 1; i < range.end.row; i++) {
                        // begin/endの中間の行単位処理
                        const line = this.state.lines[i];
                        if (!line) throw new Error("line is undefined");
                        clipboardBuf.push(line.text);
                    }

                    // 終了行のスライスヤンク
                    clipboardBuf.push(endRow.text.slice(0, range.end.col));
                }
            }
            const savedText = clipboardBuf.join("\n");
            writeClipboard(savedText);
            return savedText;

        } else if (operator === OperatorName.DEC_INDENT || operator === OperatorName.INC_INDENT) {
            const targetLines = lines.slice(range.begin.row, range.end.row);
            if (operator === OperatorName.DEC_INDENT) {
                for (const ln of targetLines) {
                    ln.text = removeFirstWhitespace(ln.text, this.config.tabstop);
                }
            } else {
                for (const ln of targetLines) {
                    ln.text = addFirstWhitespace(ln.text, this.config.tabstop);
                }
            }
            this.clampCursorCol();
            this.moveCursorToPos(range.begin.row, this.state.col);
        }

        return "";
    }

    /**
     * - count=1 またはcount=2なら1行分を結合する
     * - count>=3ならcount-1行分を結合する
     * */
    private vi_executeJoin(count: number): void {
        if (count === 1 || count === 2) {
            count = 1;
        } else {
            count--;
        }

        for (let i = 0; i < count; i++) {
            const nextLine = this.nextLine;
            if (!nextLine) break;

            if (!this.currentLine.isEmpty()) {
                this.appendTextToLine(this.currentLine, " ");
            }
            this.moveCursorToLast();

            const appending = nextLine.text.trimStart();
            this.appendTextToLine(this.currentLine, appending);
            this.deleteRow(this.state.row + 1);
        }
    }

    private vi_executePut(count: number, position: "after" | "before"): void {
        const isBefore = position === "before";
        readClipboard().then((text) => {
            if (text === null) return;

            const lines = text.split(/\r?\n/);
            if (this.state.vi_yankLinewise) {
                if (isBefore) {
                    this.insertNewLineCurrent();
                } else {
                    this.insertNewLineNext();
                }
                const destRow = this.state.row; // put実行後の移動用に保存しておく

                for (let i = 0; i < count; i++) {
                    for (let j = 0; j < lines.length; j++) {
                        const ln = lines[j] as string;
                        this.currentLine.text = ln;
                        if (j < lines.length - 1) {
                            this.insertNewLineNext();
                        }
                    }
                    // 次の繰り返し用に1行用意しておく
                    if (i < count - 1) {
                        this.insertNewLineNext();
                    }
                }
                this.moveCursorToPos(destRow, 0);
                this.moveCursorToFirstNonWhitespace();
            } else {
                const delta = isBefore ? 0 : 1; // p/Pの1文字分のずれ
                const currLine = this.currentLine;
                if (lines.length === 1) {
                    // 改行が含まれない文字列をペーストする
                    const currCol = this.state.col;
                    const repeated = text.repeat(count);
                    const before = currLine.text.slice(0, currCol + delta);
                    const after = currLine.text.slice(currCol + delta);
                    currLine.text = before + repeated + after;
                    const moveAmount = isBefore ? repeated.length - 1 : repeated.length;
                    for (let i = 0; i < moveAmount; i++) this.vi_moveCursor(MOVE_KEYS.RIGHT);
                } else {
                    // 改行を含む文字列をペーストする
                    const firstClipText = lines[0] as string;
                    const lastClipText = lines[lines.length - 1] as string;
                    for (let n = 0; n < count; n++) {
                        const currLineTail = currLine.text.slice(this.state.col + delta);

                        const destRow = this.state.row; // 実行後に移動する先
                        const destCol = Math.max(0, this.state.col + delta - (currLine.isEmpty() ? 1 : 0));

                        // 最初と最後の行の文字列は先に処理
                        currLine.text = currLine.text.slice(0, this.state.col + delta) + firstClipText;
                        const lastLineText = lastClipText + currLineTail;
                        this.insertRow(this.state.row + 1, lastLineText);
                        // if (delta === 1) this.vi_moveCursor(MOVE_KEYS.RIGHT);

                        const newLineCount = lines.length - 1;
                        if (newLineCount >= 2) {
                            // クリップボードに改行が2回以上あるとき、完全新規行に文字列を代入
                            for (let i = 0; i < newLineCount - 1; i++) {
                                const row = this.state.row + 1 + i;
                                const text = lines[i + 1];
                                if (text === undefined)
                                    throw new Error("clipboard text is undefined");
                                this.insertRow(row, text);
                            }
                        }
                        this.moveCursorToPos(destRow, destCol);
                    }
                }
            }
            const newText = joinLines(this.state.lines);
            this.saveDiff(this.state.lastSnapshot, newText);

            this.scrollWindow();
            this.render();
        });
    }

    /**
     * - 0: complete
     * - 1: doesn't exists
     * - 2: exists but incomplete
     * */
    private vi_executeNormal(input: readonly string[]): 0 | 1 | 2 {
        const parseResult = parseNormalInput(input, !!this.state.vi_macroRecording);
        if (parseResult.status === ParseStatus.UNKNOWN) {
            console.log("its unknown");
            return 1;
        }
        if (parseResult.status === ParseStatus.PENDING) {
            console.log("its pending");
            return 2;
        }
        if (parseResult.status === ParseStatus.OK) {
            console.log("its ok");
        }

        const data = parseResult.value;
        const datatype = data.type;
        /** always 1 or more */
        const count = data.count === null ? 1 : data.count;

        if (datatype === NormalCmdType.MOTION) {
            const motion = data.motion;
            this.vi_executeMotion(motion, count);

        } else if (datatype === NormalCmdType.GO_INSERT) {
            this.vi_executeInsert(data.command, count);

        } else if (datatype === NormalCmdType.OPERATOR) {
            const count = (data.count ?? 1) * (data.innerCount ?? 1);
            const range = getMotionRange(this.state, data.motion, count);
            if (data.motion.type === MotionType.FIND) {
                this.setLastFindMotion(data.motion);
            }
            if (data.operator !== OperatorName.YANK) {
                // ヤンクは繰り返しの対象にならない
                this.state.vi_lastCmd = { type: NormalCmdType.OPERATOR, count, operator: data.operator, motion: data.motion };
            }

            if (!range) {
                return 0;
            }
            const isLinewise = data.motion.type === "linewise" || range.linewise; // dj/ykのような, motiontypeはcharだがrangeとしては行単位の挙動を持つ場合がある
            this.vi_executeOperator({ operator: data.operator, range, linewise: isLinewise });
            if (data.operator === OperatorName.CHANGE) {
                this.vi_goInsert();
            }

        } else if (datatype === NormalCmdType.PUT) {
            this.vi_executePut(count, data.position);
            this.state.vi_lastCmd = { type: NormalCmdType.PUT, count, position: data.position };

        } else if (datatype === NormalCmdType.JOIN) {
            // joinにおけるcountはlinewiseにように働く
            // count=1なら1行の結合、count=2でも1行の結合になる
            this.vi_executeJoin(count);
            this.state.vi_lastCmd = { type: NormalCmdType.JOIN, count };

        } else if (datatype === NormalCmdType.REPLACE) {
            const arg = data.arg;
            const linetext = this.currentLine.text;
            const text = linetext.slice(this.state.col);

            // countが右側の文字数より多いなら実行しない
            if (count > text.length) return 0;

            const before = linetext.slice(0, this.state.col);
            const after = text.slice(count);
            const replaecd = before + arg.repeat(count) + after;
            this.currentLine.text = replaecd;
            for (let i = 0; i < count - 1; i++) this.moveCursorRight();

        } else if (datatype === NormalCmdType.GO_REPLACE) {
            // 入力処理はsetupListenersで行う
            this.state.vi_state.mode = "replace";
            this.state.cursorStyle = "under";

        } else if (datatype === NormalCmdType.REPEAT_MOT) {
            const lastMotion = this.state.vi_lastFindMotion;
            if (lastMotion === null) {
                return 0;
            }
            // 入力(";" | ",")によって移動方向が反転するため、動的にoptionsを生成する
            const optionsFn = FIND_REPEAT_OPTIONS[lastMotion.name];
            this.moveUntilNextChar(lastMotion.arg, { limit: count, ...optionsFn(data.reverse) });
        } else if (datatype === NormalCmdType.REPEAT_OPE) {
            if (!this.state.vi_lastCmd) return 0;
            // this.vi_repeatOperator(this.state.vi_lastCmd);
            const lastCmd = this.state.vi_lastCmd;

            if (data.count) {
                // TODO: lastcmd.countを上書きできるかのフラグが必要, visualで選択した内容は上書きできない
                lastCmd.count = data.count; // 指定がある場合のみcountを上書きする
            }

            if (lastCmd.type === NormalCmdType.OPERATOR) {
                const range = getMotionRange(this.state, lastCmd.motion, lastCmd.count);
                if (!range) return 0;
                this.vi_executeOperator({ operator: lastCmd.operator, range, linewise: range.linewise });
                if (lastCmd.operator === OperatorName.CHANGE) {
                    this.vi_insertBuffer(this.state.vi_insertBuf);
                    this.vi_moveCursor(MOVE_KEYS.LEFT);
                }
            } else if (lastCmd.type === NormalCmdType.GO_INSERT) {
                this.vi_executeInsertImmediately(lastCmd.insertKind, lastCmd.count);
            } else if (lastCmd.type === NormalCmdType.PUT) {
                this.vi_executePut(lastCmd.count, lastCmd.position);
            } else if (lastCmd.type === NormalCmdType.JOIN) {
                this.vi_executeJoin(lastCmd.count);
            }

        } else if (datatype === NormalCmdType.UNDO) {
            for (let i = 0; i < count; i++) this.undo();

        } else if (datatype === NormalCmdType.REDO) {
            for (let i = 0; i < count; i++) this.redo();

        } else if (datatype === NormalCmdType.SCROLL) {
            const kind = data.kind;
            if (data.count !== null) {
                this.state.vi_scrollAmount = count;
            }
            this.scrollCommandMap[kind](count);

        } else if (datatype === NormalCmdType.GO_VISUAL) {
            const isLinewise = data.linewise;
            this.vi_goVisual(isLinewise);
            if (this.state.vi_state.mode !== "visual") throw new Error("vi_state.mode is not visual. call vi_goVisual() before this line");
            if (this.state.vi_state.linewise) {
                this.state.vi_state.visualFirst.col = 0;
                this.state.vi_state.visualLast.col = this.currentLine.size - 1;
            }
        } else if (datatype === NormalCmdType.SWITCH_CASE) {
            const line = this.currentLine;
            const prefix = line.text.slice(0, this.state.col);
            const target = line.text.slice(this.state.col, this.state.col + count);
            const suffix = line.text.slice(this.state.col + count);

            line.text = prefix + swapCase(target) + suffix;

            const destCol = (
                (line.text.length <= this.state.col + count)
                ? line.text.length - 1
                : this.state.col + count
            );
            this.moveCursorToPos(this.state.row, destCol);
        } else if (datatype === NormalCmdType.TO_LOWER || datatype === NormalCmdType.TO_UPPER) {
            const count = (data.count ?? 1) * (data.innerCount ?? 1);
            const range = getMotionRange(this.state, data.motion, count);

            if (data.motion.type === MotionType.FIND) {
                this.setLastFindMotion(data.motion);
            }
            // TODO: 繰り返しvi_lastCmdの設定
            if (!range) {
                return 0;
            }

            const { first, last } = toInclusiveRange(range.begin, range.end, range.linewise);
            this.applyVisualTransform(first, last, (selected) => {
                if (datatype === NormalCmdType.TO_LOWER) {
                    return selected.toLowerCase();
                }
                return selected.toUpperCase();
            });
        } else if (datatype === NormalCmdType.MACRO_START) {
            if (this.state.vi_macroRecording !== null) throw new Error("vi_macroRecording must be null");
            if (!isValidMacroChar(data.arg)) {
                return 0;
            }
            this.vi_startMacro(data.arg);

        } else if (datatype === NormalCmdType.MACRO_FINISH) {
            if (this.state.vi_macroRecording === null) throw new Error("vi_macroRecording must be a char");
            this.vi_finishMacro(this.state.vi_macroRecording);

        } else if (datatype === NormalCmdType.MACRO_PLAY) {
            if (!isValidMacroChar(data.arg)) {
                return 0;
            }
            this.vi_playMacro(data.arg, count);
            this.state.vi_macroLastPlayed = data.arg;

        } else if (datatype === NormalCmdType.MACRO_REPEAT) {
            if (!this.state.vi_macroLastPlayed) return 0;
            this.vi_playMacro(this.state.vi_macroLastPlayed, count);

        }

        return 0;
    }

    private vi_executeVisual(input: readonly string[]): 0 | 1 | 2 {
        if (this.state.vi_state.mode !== "visual") throw new Error("vi_state.mode should be 'visual'");
        const vi_state = this.state.vi_state; // クロージャで使うためnarrow後にローカル変数にバインド
        const parseResult = parseVisualInput(input);

        switch (parseResult.status) {
            case ParseStatus.UNKNOWN:
                console.log("its unknown");
                return 1;
            case ParseStatus.PENDING:
                console.log("its pending");
                return 2;
            case ParseStatus.OK:
                // pass
                console.log("its ok");
                break;
        }

        const data = parseResult.value;
        const datatype = data.type;
        const count = data.count === null ? 1 : data.count;

        /** textobjの範囲を注入できる */
        const syncCursorAndVisual = (range?: TextRange) => {
            const first = vi_state.visualFirst;
            const last = vi_state.visualLast;

            if (range) {
                if (vi_state.linewise !== false)
                    throw new Error("vi_state.linewise must be false at this point");
                vi_state.rangeSide = "first";
                first.row = range.end.row;
                first.col = range.end.col;
                last.row  = range.end.row;
                last.col  = range.end.col - 1; // getMotionRangeはend.colを排他的範囲で返すため包括的範囲に変換する
            }

            // sync cusror and first/last
            // カーソルがどちらかのsideを追い越すようなときに値を入れ替える
            if (vi_state.rangeSide === "first") {
                first.row = this.state.row;
                first.col = this.state.col;
                if (
                    (first.row === last.row && first.col > last.col) ||
                    (first.row > last.row)
                ) {
                    vi_state.rangeSide = "last";
                    [first.row, last.row] = [last.row, first.row];
                    [first.col, last.col] = [last.col, first.col];
                }
            } else {
                last.row = this.state.row;
                last.col = this.state.col;
                if (
                    (last.row === first.row && last.col < first.col) ||
                    (last.row < first.row)
                ) {
                    vi_state.rangeSide = "first";
                    [first.row, last.row] = [last.row, first.row];
                    [first.col, last.col] = [last.col, first.col];
                }
            }
        };

        if (datatype === VisualCmdType.SWITCH_SIDE) {
            const dest = (vi_state.rangeSide === "first") ? vi_state.visualLast : vi_state.visualFirst;
            this.moveCursorToPos(dest.row, dest.col);
            vi_state.rangeSide = (vi_state.rangeSide === "first") ? "last" : "first";

        } else if (datatype === VisualCmdType.MOTION) {
            const motion = data.motion;
            if (motion.type === MotionType.FIND) {
                this.setLastFindMotion(motion);
            }
            if (motion.type === MotionType.TEXTOBJ) {
                const range = getMotionRange(this.state, data.motion, count);
                if (!range) return 0;
                vi_state.linewise = false; // textobj選択が成功したらvisual_lineではなくなる
                this.moveCursorToPos(range.begin.row, range.begin.col);
                syncCursorAndVisual(range);
                this.moveCursorToPos(range.end.row, range.end.col - 1);
                vi_state.charCount = this.getCharCount(vi_state.visualFirst, vi_state.visualLast);
                vi_state.lineCount = this.getLineCount(vi_state.visualFirst, vi_state.visualLast);
                return 0;
            }
            this.vi_executeMotion(motion, count);
            syncCursorAndVisual();
            if (vi_state.linewise) {
                vi_state.visualFirst.col = 0;
                vi_state.visualLast.col = this.state.lines[vi_state.visualLast.row]!.size - 1;
            }
            vi_state.charCount = this.getCharCount(vi_state.visualFirst, vi_state.visualLast);
            vi_state.lineCount = this.getLineCount(vi_state.visualFirst, vi_state.visualLast);

        } else if (datatype === VisualCmdType.REPEAT_MOT) {
            const lastMotion = this.state.vi_lastFindMotion;
            if (lastMotion === null) {
                return 0;
            }
            // 入力(";" | ",")によって移動方向が反転するため、動的にoptionsを生成する
            const optionsFn = FIND_REPEAT_OPTIONS[lastMotion.name];
            this.moveUntilNextChar(lastMotion.arg, { limit: count, ...optionsFn(data.reverse) });
            syncCursorAndVisual();

        } else if (datatype === VisualCmdType.OPERATOR) {
            if (this.state.vi_state.mode !== "visual")
                throw new Error("vi_state.mode should be 'visual'");
            const exclusiveRange =
                toExclusiveTextRange(vi_state.visualFirst, vi_state.visualLast, vi_state.linewise);
            const operator = data.operator;
            this.vi_executeOperator({ operator, range: exclusiveRange, linewise: vi_state.linewise });

            if (operator === OperatorName.CHANGE) {
                this.vi_goInsert();
            } else {
                this.vi_goNormal();
            }

            // yankは繰り返さない
            if (operator === OperatorName.YANK) return 0;

            // 繰り返しの登録
            if (operator === OperatorName.DEC_INDENT || operator === OperatorName.INC_INDENT) {
                const count = exclusiveRange.end.row - exclusiveRange.begin.row;
                // インデントコマンドの繰り返しにmotionは必要ではないが仮で定義する
                const motion: MotionContext = {
                    type: MotionType.LINEWISE,
                };
                this.state.vi_lastCmd = { type: "operator", count, operator, motion };
            } else {
                if (vi_state.linewise) {
                    // 行単位の範囲は既存の型で代替できる
                    const motion: MotionContext = {
                        type: MotionType.LINEWISE,
                    };
                    this.state.vi_lastCmd = { type: "operator", count, operator, motion };
                } else {
                    const motion: MotionContext = {
                        type: MotionType.OFFSET_CHAR,
                        lineCount: vi_state.lineCount,
                        charCount: vi_state.charCount,
                        destCol: vi_state.visualLast.col,
                    };
                    this.state.vi_lastCmd = { type: "operator", count, operator, motion };
                }
            }
        } else if (datatype === VisualCmdType.PUT) {
            // レジスタが空でも実行する, その場合空文字に置き換える
            const saved = this.vi_executeOperator({
                operator: OperatorName.DELETE,
                range: toExclusiveTextRange(vi_state.visualFirst, vi_state.visualLast, vi_state.linewise),
                linewise: vi_state.linewise,
                writeRegister: false,
            });
            this.vi_executePut(count, "before");
            if (data.writeRegister) {
                writeClipboard(saved);
            }
            this.vi_goNormal();

        } else if (datatype === VisualCmdType.JOIN) {
            this.moveCursorToPos(vi_state.visualFirst.row, vi_state.visualFirst.col);
            this.vi_executeJoin(vi_state.lineCount);
            this.vi_goNormal();

        } else if (datatype === VisualCmdType.REPLACE) {
            this.applyVisualTransform(vi_state.visualFirst, vi_state.visualLast, (selected) => {
                return data.arg.repeat(selected.length);
            });
        } else if (datatype === VisualCmdType.TO_LOWER) {
            this.applyVisualTransform(vi_state.visualFirst, vi_state.visualLast, (selected) => {
                return selected.toLowerCase();
            });
        } else if (datatype === VisualCmdType.TO_UPPER) {
            this.applyVisualTransform(vi_state.visualFirst, vi_state.visualLast, (selected) => {
                return selected.toUpperCase();
            });
        } else if (datatype === VisualCmdType.REVERSE_CASE) {
            this.applyVisualTransform(vi_state.visualFirst, vi_state.visualLast, swapCase);
        }
        return 0;
    }

    private vi_startMacro(macroChar: MacroChar): void {
        this.state.vi_macroRecording = macroChar;
        this.state.vi_macroTable[macroChar] = [];
    }

    private vi_finishMacro(key: MacroChar): void {
        this.state.vi_macroTable[key].pop(); // マクロを終了するqキーの記録を削除する
        this.state.vi_macroRecording = null;
    }

    private vi_playMacro(key: MacroChar, count: number): void {
        this.state.vi_macroCallback = () => {
            for (let i = 0; i < count; i++) {
                this.state.vi_macroTable[key].forEach((k) => {
                    this.vi_executeKeypress(k);
                });
            }
        };
    }

    private applyVisualTransform(
        first: InclusivePos,
        last: InclusivePos,
        transform: (selected: string) => string,
    ): void {
        const lines = this.iterateRange(first.row, last.row);
        for (const { line, index } of lines) {
            const { prefix, selected, suffix } =
                this.getLineSegments(line, index, first, last);
            line.text = prefix + transform(selected) + suffix;
        }
        this.moveCursorToPos(first.row, first.col);
        this.vi_goNormal();
    }

    private getLineSegments(
        line: Line,
        index: number,
        first: InclusivePos,
        last: InclusivePos,
    ): { prefix: string, selected: string, suffix: string } {
        const isFirst = (index === first.row);
        const isLast  = (index === last.row);
        const text = line.text;

        if (isFirst && isLast) {
            const prefix = text.slice(0, first.col);
            const selected = text.slice(first.col, last.col + 1);
            const suffix = text.slice(last.col + 1);
            return { prefix, selected, suffix };

        } else if (isFirst) {
            const prefix = text.slice(0, first.col);
            const selected = text.slice(first.col);
            const suffix = "";
            return { prefix, selected, suffix };

        } else if (isLast) {
            const prefix = "";
            const selected = text.slice(0, last.col + 1);
            const suffix = text.slice(last.col + 1);
            return { prefix, selected, suffix };

        } else {
            const prefix = "";
            const selected = text;
            const suffix = "";
            return { prefix, selected, suffix };

        }
    }

    private *iterateRange(
        firstRow: number,
        lastRow: number
    ): Generator<{ line: Line, index: number}> {
        for (let i = firstRow; i <= lastRow; i++) {
            const line = this.state.lines[i];
            if (!line) throw new Error(`lines[${i}] is undefined`);
            yield { line, index: i };
        }
    }

    private scrollCommandMap: Record<ScrollCommand, (count: number) => void> = {
        "UP_HALF": () => {
            for (let i = 0; i < this.state.vi_scrollAmount; i++) {
                this.vi_moveCursor(MOVE_KEYS.UP);
                this.scrollUp();
            }
        },
        "DOWN_HALF": () => {
            for (let i = 0; i < this.state.vi_scrollAmount; i++) {
                this.vi_moveCursor(MOVE_KEYS.DOWN);
                this.scrollDown();
            }
        },
        "UP_FULL": (count) => {
            for (let i = 0; i < count; i++) this.pageUp();
        },
        "DOWN_FULL": (count) => {
            for (let i = 0; i < count; i++) this.pageDown();
        },
    };

    /** 1行上にスクロールする */
    private scrollUp(): void {
        this.state.rowoff = Math.max(0, this.state.rowoff - 1);
    }

    /** 1行下にスクロールする。最終行でスクロールは止まる。 */
    private scrollDown(): void {
        const maxRowoff = this.state.lines.length - this.config.screenrows + 1;
        this.state.rowoff = Math.min(maxRowoff, this.state.rowoff + 1);
    }

    /** 1行上にスクロールする。カーソルが画面を超えるなら追従する */
    private scrollUpWithCursor(): void {
        this.state.rowoff = Math.max(0, this.state.rowoff - 1);
        const dest = this.state.rowoff + this.config.screenrows - 1 - this.config.statusBarHeight;
        if (this.state.row > dest) {
            this.moveCursorUp();
        }
        this.clampCursorCol();
    }

    /** 1行下にスクロールする。カーソルが画面を超えるなら追従する */
    private scrollDownWithCursor(): void {
        this.state.rowoff = Math.min(this.state.lines.length - 1, this.state.rowoff + 1);
        if (this.state.row < this.state.rowoff) {
            this.moveCursorDown();
        }
        this.clampCursorCol();
    }

    private scrollRightWithCursor(): void {
        this.state.logicaloff += 1;
        if (this.state.logicalWidth < this.state.logicaloff) {
            this.vi_moveCursor(MOVE_KEYS.RIGHT);
            if (this.state.col < this.currentLine.size - 1) return;
            // 表示中の行の中で最もwidthが大きい行に移動する
            let destRow = this.state.row;
            const lines = this.state.lines;

            const slicedLines =
                lines.slice(
                    this.state.rowoff, this.state.rowoff + this.config.screenrows - this.config.statusBarHeight
            ).map((ln, i) => ({ ln, idx: this.state.rowoff + i }));

            for (const { ln, idx } of slicedLines) {
                if (calcLogicalWidth(lines[destRow].text) < calcLogicalWidth(ln.text)) {
                    destRow = idx;
                }
            }
            this.moveCursorToPos(destRow, this.state.col);
        }
    }

    private scrollLeftWithCursor(): void {
        this.state.logicaloff = Math.max(0, this.state.logicaloff - 1);
        const border = this.state.logicaloff + this.config.screencols - 1 - this.lineNumberCols;
        if (this.state.logicalWidth > border) {
            this.vi_moveCursor(MOVE_KEYS.LEFT);
        }
    }

    private pageUp(): void {
        const screenrows = getFullScreenRows(this.config) - 1;
        this.state.row = Math.max(screenrows, this.state.rowoff);
        this.state.rowoff = Math.max(0, this.state.row - screenrows);
    }

    private pageDown(): void {
        const screenrows = getFullScreenRows(this.config);
        this.state.row = Math.min(this.state.lines.length - 1, this.state.rowoff + screenrows - 1);
        this.state.rowoff = this.state.row;
    }

    private setLastFindMotion(motion: Extract<MotionContext, { arg: string }>): void {
        const { name, arg } = motion;
        this.state.vi_lastFindMotion = { name, arg };
    }

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

    private vi_goNormal(): void {
        if (this.state.vi_state.mode === "insert" || this.state.vi_state.mode === "replace") {
            this.vi_moveCursor(MOVE_KEYS.LEFT);
        }
        this.state.vi_state = { mode: "normal" };
        this.state.cursorStyle = "full";
        this.state.vi_cmd = [];
        this.state.vi_insertResolve?.();
        this.state.vi_insertResolve = null;
    }

    private vi_goInsert(): void {
        this.state.vi_state.mode = "insert";
        this.state.cursorStyle = "vertical";
        this.state.vi_insertBuf = [];
    }

    private vi_goVisual(linewise: boolean): void {
        const row = this.state.row;
        const col = this.state.col;
        this.state.vi_state = {
            mode: "visual",
            rangeSide: "first",
            visualFirst: { row, col },
            visualLast: { row, col },
            linewise,
            charCount: linewise ? this.currentLine.size : 1,
            lineCount: 1,
        };
    }

    private keyMap: Record<string, () => void> = {
        ArrowLeft: () => {
            this.moveCursor(MOVE_KEYS.LEFT);
            this.state.vi_insertBuf = [];
        },
        ArrowRight: () => {
            this.moveCursor(MOVE_KEYS.RIGHT);
            this.state.vi_insertBuf = [];
        },
        ArrowUp: () => {
            this.moveCursor(MOVE_KEYS.UP);
            this.state.vi_insertBuf = [];
        },
        ArrowDown: () => {
            this.moveCursor(MOVE_KEYS.DOWN);
            this.state.vi_insertBuf = [];
        },
        Backspace: () => {
            this.deleteChar();
            this.state.vi_insertBuf.push(Editor.VI_BACKSPACE);
        },
        Delete: () => {
            if (this.isAtVeryTail()) return;
            this.moveCursor(MOVE_KEYS.RIGHT);
            this.deleteChar();
            this.state.vi_insertBuf.push(Editor.VI_DELETE);
        },
        Enter: () => {
            this.insertNewLine();
            this.state.vi_insertBuf.push(Editor.VI_ENTER);
        },
        Tab: () => {
            this.indent();
            this.state.vi_insertBuf.push(Editor.VI_TAB);
        },
    };

    private processKeypress(input: string, { replace = false } = {}): void {
        const action = this.keyMap[input];

        if (action) {
            action();
        } else {
            if (input.length > 1) return;
            this.insertText(input, { replace });
            this.state.vi_insertBuf.push(input);
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
        if (
            this.state.row + this.config.statusBarHeight >=
            this.state.rowoff + this.config.screenrows
        ) {
            // increase rowoff
            this.state.rowoff =
                this.state.row - this.config.screenrows + 1 + this.config.statusBarHeight;
        }

        if (this.state.logicalWidth < this.state.logicaloff) {
            // decrease logicaloff
            this.state.logicaloff = this.state.logicalWidth;
        }

        const screencols = this.config.screencols;
        const lineNumberCols = this.lineNumberCols;
        if (this.state.logicalWidth + lineNumberCols >= this.state.logicaloff + screencols) {
            // スクロール時に常に列を開けるためLOGICAL_HALF_WIDHTを加算する
            this.state.logicaloff =
                this.state.logicalWidth - screencols + lineNumberCols + LOGICAL_HALF_WIDTH;
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
                    this.syncPreferredWidth();
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
                    this.syncPreferredWidth();
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

    private insertNewLine(): void {
        const currLine = this.currentLine;
        const textBefore = currLine.text.slice(0, this.state.col);
        const textAfter = currLine.text.slice(this.state.col);

        currLine.text = textBefore;
        this.insertRow(this.state.row + 1, textAfter, this.state.row);
    }

    private insertNewLineNext(): void {
        this.insertRow(this.state.row + 1, "", this.state.row);
    }

    private insertNewLineCurrent(): void {
        this.insertRow(this.state.row, "", this.state.row);
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
        this.state.col += text.length;
        this.state.logicalWidth += calcLogicalWidth(text);
        this.syncPreferredWidth();
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
        this.syncPreferredWidth();
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
        const currLine = this.state.lines[this.state.row];
        if (!currLine) throw new Error(`currentLine is undefined. lines[${this.state.row}]`);
        return currLine;
    }

    private get nextLine(): Line | undefined {
        return this.state.lines[this.state.row + 1];
    }

    private get prevLine(): Line | undefined {
        return this.state.lines[this.state.row - 1];
    }

    private syncPreferredWidth(): void {
        this.state.preferredWidth = this.state.logicalWidth;
    }

    /** appendedRow: インデント調整の参照元となる行数 */
    private insertRow(row: number, text: string, appendedRow?: number): void {
        if (row < 0 || row > this.state.lines.length) return;

        const newLine = new Line();
        if (this.config.autoIndent && appendedRow) {
            const appendedLine = this.state.lines[appendedRow];
            if (!appendedLine) throw new Error(`appendingLine is undefined. lines[${appendedRow}]`);
            const whitespaceCount = getCountUntilNonWhitespace(appendedLine.text);
            newLine.text = " ".repeat(whitespaceCount) + text;
            this.state.row = row;
            this.state.col = whitespaceCount;
            this.state.logicalWidth = whitespaceCount;
            this.syncPreferredWidth();
        } else {
            newLine.text = text;
            this.state.row = row;
            this.state.col = 0;
            this.state.logicalWidth = 0;
            this.syncPreferredWidth();
        }
        this.state.lines.splice(row, 0, newLine);
    }

    private deleteRow(row: number): void {
        if (row < 0 || row >= this.state.lines.length) return;
        this.state.lines.splice(row, 1);
        const len = this.state.lines.length;
        if (len === 0) {
            this.insertRow(0, "");
            this.moveCursorToFirst();
            return;
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
        return this.state.row === this.state.lines.length - 1 && this.isAtLineTail();
    }

    private moveCursorLeft(): void {
        const prevChar = this.currentLine.text.slice(this.state.col - 1, this.state.col);
        this.state.col--;
        this.state.logicalWidth -= calcLogicalWidth(prevChar);
        this.syncPreferredWidth();
    }

    private moveCursorRight(): void {
        const currChar = this.currentLine.text.slice(this.state.col, this.state.col + 1);
        this.state.col++;
        this.state.logicalWidth += calcLogicalWidth(currChar);
        this.syncPreferredWidth();
    }

    private moveCursorUp(): void {
        const prevLine = this.prevLine; // 1つ上の行
        if (!prevLine) throw new Error("moveCursorUp called at first row");
        this.state.row--;
        this.recalcColWidth(prevLine);
        if (this.state.col >= prevLine.size && !prevLine.isEmpty()) {
            const lastChar = prevLine.text.slice(-1);
            this.state.col--;
            this.state.logicalWidth -= calcLogicalWidth(lastChar);
        }
    }

    private moveCursorDown(): void {
        const nextLine = this.nextLine; // 1つ下の行
        if (!nextLine) throw new Error("moveCursorDown called at last row");
        this.state.row++;
        this.recalcColWidth(nextLine);
        if (this.state.col >= nextLine.size && !nextLine.isEmpty()) {
            const lastChar = nextLine.text.slice(-1);
            this.state.col--;
            this.state.logicalWidth -= calcLogicalWidth(lastChar);
        }
    }

    private moveCursorToFirst(): void {
        this.state.col = 0;
        this.state.logicalWidth = 0;
        this.syncPreferredWidth();
    }

    private moveCursorToFirstNonWhitespace(): void {
        const line = this.currentLine;
        const start = getCountUntilNonWhitespace(line.text);
        this.state.col = start;
        this.state.logicalWidth = calcLogicalWidth(line.text.slice(0, start));
        this.syncPreferredWidth();
    }

    private moveCursorToLast(): void {
        const line = this.currentLine;
        const end = line.isEmpty() ? 0 : line.size - 1;
        this.state.col = end;
        this.state.logicalWidth = calcLogicalWidth(line.text.slice(0, end));
        this.syncPreferredWidth();
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
        const logicalWidth = Math.min(this.state.preferredWidth, calcLogicalWidth(destLine.text));
        const col = logicalWidthToCol(logicalWidth, destLine.text);
        this.state.col = col;
        this.state.logicalWidth = calcLogicalWidth(destLine.text.slice(0, col));
    }

    private moveCursorToPos(row: number, col: number) {
        const destLine = this.state.lines[row];
        if (!destLine) throw new Error(`lines[${row}] is undefined`);
        this.state.row = row;
        this.state.col = col;
        this.state.logicalWidth = calcLogicalWidth(destLine.text.slice(0, col));
        this.syncPreferredWidth();
    }

    /**
     * - DOM要素の文字列が更新されるような場面でrow/colの不整合を解決する
     * - 最も近い行に移動する
     * - 行はあるが文字がない場合は0文字目に移動する
     * */
    private clampCursor(): void {
        this.clampCursorRow();
        this.clampCursorCol();
    }

    /** preferredWidthを変更しない */
    private clampCursorRow(): void {
        const maybeLine = this.state.lines[this.state.row];
        if (!maybeLine) {
            // カーソルの位置に行が存在しない場合
            this.state.row = this.state.lines.length - 1;
        }
    }

    /** preferredWidthを変更しない */
    private clampCursorCol(): void {
        const maybeChar = this.currentLine.text[this.state.col];
        if (!maybeChar) {
            // カーソルの位置に行は存在するが、文字が存在しない場合
            const line = this.currentLine;
            const col = line.isEmpty() ? 0 : line.size - 1;
            this.state.col = col;
            this.state.logicalWidth = calcLogicalWidth(line.text.slice(0, col));
        }
    }

    private moveUntilNextChar(
        arg: string,
        { reverse = false, stopBefore = false, limit = 1, ignoreNextCh = false }: FindMoveOptions,
    ): void {
        const text = this.currentLine.text;
        const sliced = (
            (reverse)
                ? text.slice(0, this.state.col)
                : text.slice(this.state.col + 1)
        );
        const distance = getCountToNextChar(arg, sliced, {
            limit,
            reverse,
            stopBefore,
            ignoreNextCh,
        });
        if (!distance) return;

        if (reverse) {
            this.moveCursorToPos(this.state.row, this.state.col - distance);
        } else {
            this.moveCursorToPos(this.state.row, this.state.col + distance);
        }
    }

    /** 上下移動で行末に張り付きながら移動するため非常に高い値を設定する($モーション) */
    private setMaxPreferredWidth(): void {
        this.state.preferredWidth = Infinity;
    }

    private getCharCount(first: InclusivePos, last: InclusivePos): number {
        if (first.row === last.row) {
            return last.col - first.col + 1;
        } else {
            const firstrow = this.state.lines[first.row]!.text.slice(first.col).length;
            const endrow = this.state.lines[last.row]!.text.slice(0, last.col + 1).length;
            let middleRowChars = 0;
            for (let i = first.row + 1; i < last.row; i++) {
                const ln = this.state.lines[i] as Line;
                if (ln.isEmpty()) {
                    middleRowChars++;
                } else {
                    middleRowChars += ln.size;
                }
            }
            return firstrow + middleRowChars + endrow;
        }
    }

    private getLineCount(first: InclusivePos, last: InclusivePos): number {
        return last.row - first.row + 1;
    }

    private get lineNumberCols(): number {
        return String(this.state.lines.length).length + 2;
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

    // ------------------------------
    // | undo / redo
    // ------------------------------

    /** 差分保存を割り込みで無効化するフラグ */
    private disableSaveDiff = false;

    private saveDiff(oldText: string, newText: string): void {
        if (this.disableSaveDiff) {
            this.disableSaveDiff = false;
            return;
        }

        if (oldText === newText) {
            return;
        }

        const diff = createDiff(oldText, newText);
        this.state.diffStack[this.state.stackPtr] = diff;
        this.state.cursorStack[this.state.stackPtr] = { row: this.state.row, col: this.state.col };

        this.state.lastSnapshot = newText;
        this.state.stackPtr++;
        this.state.diffStack.length = this.state.stackPtr; // ptr以降の要素を切り捨て, undo後に編集すると以降の履歴を削除する
        this.state.cursorStack.length = this.state.stackPtr; // ptr以降の要素を切り捨て, undo後に編集すると以降の履歴を削除する
    }

    private undo(): string | void {
        if (this.state.stackPtr === 0) {
            console.log("Already at oldest change");
            return;
        }
        // この時点でptrは1以上ある
        this.state.stackPtr--;
        this.applyReverse(this.state.diffStack[this.state.stackPtr]!.split("\n"));
    }

    private redo(): string | void {
        if (this.state.stackPtr === this.state.diffStack.length) {
            console.log("Already at newest change");
            return;
        }
        this.applyForward(this.state.diffStack[this.state.stackPtr]!.split("\n"));
        this.state.stackPtr++;
    }

    private applyReverse(diffLines: string[]): void {
        const result: Line[] = [];
        let newPos = 0;

        let i = 0;
        while (i < diffLines.length && !diffLines[i]!.startsWith("@@")) i++;

        while (i < diffLines.length) {
            const dline = diffLines[i]!;
            if (!dline.startsWith("@@")) {
                i++;
                continue;
            }

            const { newStart } = toRange(dline);
            i++;

            while (newPos < newStart - 1) {
                result.push(this.state.lines[newPos++]!);
            }

            while (i < diffLines.length && !diffLines[i]!.startsWith("@@")) {
                const line = diffLines[i]!;
                const firstCh = line[0];
                if      (firstCh === " ") { result.push(new Line(line.slice(1))); newPos++; }
                else if (firstCh === "-") { result.push(new Line(line.slice(1))); }
                else if (firstCh === "+") { newPos++; }
                i++;
            }
        }

        while (newPos < this.state.lines.length) result.push(this.state.lines[newPos++]!);

        if (result.length === 0) {
            result.push(new Line());
        }
        this.state.lines = result;
        this.state.lastSnapshot = joinLines(result);

        const cursor = (
            this.state.stackPtr === 0
            ? { row: 0, col: 0 }
            : this.state.cursorStack[this.state.stackPtr]
        );
        if (!cursor) throw new Error("cursor is undefined");
        this.moveCursorToPos(cursor.row, cursor.col);
        this.clampCursor();
    }

    private applyForward(diffLines: string[]): void {
        const result: Line[] = [];
        let oldPos = 0;

        let i = 0;
        while (i < diffLines.length && !diffLines[i]!.startsWith("@@")) i++;

        while (i < diffLines.length) {
            const dline = diffLines[i]!;
            if (!dline.startsWith("@@")) {
                i++;
                continue;
            }

            const { oldStart } = toRange(dline);
            i++;

            while (oldPos < oldStart - 1) result.push(this.state.lines[oldPos++]!);

            while (i < diffLines.length && !diffLines[i]!.startsWith("@@")) {
                const line = diffLines[i]!;
                const firstCh = line[0];
                if      (firstCh === " ") { result.push(new Line(line.slice(1))); oldPos++; }
                else if (firstCh === "+") { result.push(new Line(line.slice(1))); }
                else if (firstCh === "-") { oldPos++; }
                i++;
            }
        }

        while (oldPos < this.state.lines.length) result.push(this.state.lines[oldPos++]!);

        this.state.lines = result;
        this.state.lastSnapshot = joinLines(result);

        const cursor = this.state.cursorStack[this.state.stackPtr];
        if (!cursor) throw new Error("cursor is undefined");
        this.moveCursorToPos(cursor.row, cursor.col);
    }
}
