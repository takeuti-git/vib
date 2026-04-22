import { getFullScreenRows, getHalfScreenRows, type EditorConfig } from "./config";
import type { Renderer } from "./renderer";
import { type EditorState, resetState } from "./state";
import { Line, getLines, joinLines } from "./line";
import { getInputFromEvent, isFunctionKey, isValidKey, MOVE_KEYS, type MoveKey } from "./keys";
import { hideElement, setElementFontsize, showElement } from "./dom";
import { LOGICAL_HALF_WIDTH, addFirstWhitespace, calcLogicalWidth, getCountUntilNonWhitespace, logicalWidthToCol, removeFirstWhitespace } from "./utils";
import {
    getCountToNextChar,
    getMotionRange,
    moveForward,
    moveTail,
    moveBackward,
} from "./myvim/motion";
import { parseCommand } from "./myvim/parser";
import type { InsertCommand, Motion, Operator } from "./myvim/parser/command";
import { readClipboard, writeClipboard } from "./clipboard";
import {
    FIND_COMMAND_OPTIONS,
    FIND_REPEAT_OPTIONS,
    type FindMoveOptions,
} from "./myvim/findCommand";
import { createDiff, toRange } from "./undo";
import type { ScrollKind } from "./myvim/parser/scroll";
import type { MotionContext } from "./myvim/parser/motionType";
import { parseVisualCommand } from "./myvim/parser/visual";
import type { InclusivePos, TextRange } from "./types/motion";

/** 角括弧の始まりの文字コード */
const OPENING_BRACKET = 0x5b;

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
        } else {
            // down
            for (let i = 0; i < 3; i++) {
                this.scrollDownWithCursor();
            }
        }
        this.scrollWindow();
        this.render();
    };

    /** Canvas要素内でのクリック座標を用いてカーソルを移動する */
    private handleCanvasMousedown = (e: MouseEvent): void => {
        const charWidth = this.config.baseFontSize / 2;
        const lineNumberWidth = this.config.lineNumberCols * charWidth;
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
        const key = e.key;
        if (isFunctionKey(key)) return; // fnキーは通常通り動作させるため早期リターン
        e.preventDefault();
        e.stopImmediatePropagation(); // サイト側のkeydownイベントを発火させない
        if (e.isComposing) return;

        if (e.shiftKey) {
            const resize = this.resizeMap[key];
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

        // 括弧の文字をそのまま使うと開発中にvimのtextobjがバグる
        if (key === "Escape" || (key.codePointAt(0) === OPENING_BRACKET && e.ctrlKey)) {
            this.vi_goNormal();
            this.render();

            const newText = joinLines(this.state.lines);
            this.saveDiff(this.state.lastSnapshot, newText);
            return;
        }

        // processing
        if (this.state.vi_state.mode === "normal" || this.state.vi_state.mode === "visual") {
            if (!isValidKey(key)) return;
            const input = getInputFromEvent(e);
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
            this.processKeypress(e);
            this.scrollWindow();
            this.render();

        } else if (this.state.vi_state.mode === "replace") {
            this.processKeypress(e, { replace: true });
            this.scrollWindow();
            this.render();
        }

        this.scheduleElementValueUpdate();
    };

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
                2 + this.config.lineNumberCols,
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

    // remaining = ["H","L","%"]
    // @ts-expect-error there are unimplemented motions
    private motionMap: Record<Motion, () => void> = {
        "h": () => this.vi_moveCursor(MOVE_KEYS.LEFT),
        "l": () => this.vi_moveCursor(MOVE_KEYS.RIGHT),
        "j": () => this.vi_moveCursor(MOVE_KEYS.DOWN),
        "k": () => this.vi_moveCursor(MOVE_KEYS.UP),
        "0": () => this.moveCursorToFirst(),
        "_": () => this.moveCursorToFirstNonWhitespace(),
        "^": () => this.moveCursorToFirstNonWhitespace(),
        "$": () => {
            this.moveCursorToLast();
            this.setMaxPreferredWidth();
        },
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
        "Enter": () => {
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
            const { distance } = moveBackward(this.state, "word");
            for (let i = 0; i < distance; i++) this.moveCursor(MOVE_KEYS.LEFT);
        },
        "B": () => {
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
        i: () => {
            /* ここでは何もしない */
        },
        a: () => {
            /* ここでは何もしない */
        },
        I: () => this.moveCursorToFirstNonWhitespace(),
        A: () => this.moveCursorToLast(),
        o: () => this.insertNewLineNext(),
        O: () => this.insertNewLineCurrent(),
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
        if ((insertKind === "a" || insertKind === "A") && !this.isAtLineTail()) {
            this.moveCursor(MOVE_KEYS.RIGHT);
        }
        if (count >= 2 && (insertKind === "o" || insertKind === "O")) {
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

        if ((insertKind === "a" || insertKind === "A") && !this.isAtLineTail()) {
            this.moveCursor(MOVE_KEYS.RIGHT);
        }
        this.vi_goInsert();

        (async () => {
            await new Promise<void>((resolve) => {
                this.state.vi_insertResolve = resolve;
            });
            // this.state.vi_insertResolveがどこかで呼び出されるまで以下を実行しない

            if (count >= 2 && (insertKind === "o" || insertKind === "O")) {
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
            operator: Operator, range: TextRange, linewise: boolean, writeRegister?: boolean
        }
    ): string {
        const { lines } = this.state;
        const clipboardBuf: string[] = [];
        this.state.vi_yankLinewise = linewise;

        if (operator === "d" || operator === "c") {
            if (linewise) {
                lines.slice(range.begin.row, range.end.row).forEach((l) => {
                    clipboardBuf.push(l.text);
                });
                const delCount = range.end.row - range.begin.row;
                lines.splice(range.begin.row, delCount);

                const row = Math.min(range.begin.row, lines.length - 1);
                this.state.row = Math.max(0, row);

                if (operator === "c") {
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
                operator === "d" &&
                this.state.col >= this.currentLine.size &&
                this.state.col !== 0
            ) {
                // 文字削除でカーソルが行からはみ出た時
                this.moveCursor(MOVE_KEYS.LEFT);
            }
            const savedText = clipboardBuf.join("\n");
            if (writeRegister) {
                writeClipboard(savedText);
            }
            return savedText;

        } else if (operator === "y") {
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

        } else if (operator === "<" || operator === ">") {
            const targetLines = lines.slice(range.begin.row, range.end.row);
            if (operator === "<") {
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
                    for (const ln of lines) {
                        this.currentLine.text = ln;
                        this.insertNewLineNext();
                    }
                    this.deleteRow(this.state.row);
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
        const parseResult = parseCommand(input);
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
        /** always 1 or more */
        const count = data.count === null ? 1 : data.count;

        if (datatype === "motion") {
            const motion = data.motion;
            this.vi_executeMotion(motion, count);

        } else if (datatype === "insert") {
            this.vi_executeInsert(data.command, count);

        } else if (datatype === "operator") {
            const count = (data.count ?? 1) * (data.innerCount ?? 1);
            const range = getMotionRange(this.state, data.motion, count);
            if (data.motion.type === "find") {
                this.setLastFindMotion(data.motion);
            }
            if (data.operator !== "y") {
                // ヤンクは繰り返しの対象にならない
                this.state.vi_lastCmd = { type: "operator", count, operator: data.operator, motion: data.motion };
            }

            if (!range) {
                return 0;
            }
            const isLinewise = data.motion.type === "linewise" || range.linewise; // dj/ykのような, motiontypeはcharだがrangeとしては行単位の挙動を持つ場合がある
            this.vi_executeOperator({ operator: data.operator, range, linewise: isLinewise });
            if (data.operator === "c") {
                this.vi_goInsert();
            }

        } else if (datatype === "put") {
            this.vi_executePut(count, data.position);
            this.state.vi_lastCmd = { type: "put", count, position: data.position };

        } else if (datatype === "join") {
            // joinにおけるcountはlinewiseにように働く
            // count=1なら1行の結合、count=2でも1行の結合になる
            this.vi_executeJoin(count);
            this.state.vi_lastCmd = { type: "join", count };

        } else if (datatype === "replace") {
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
            } else if (kind === "continuous") {
                // 置き換え処理はsetupListenersで行う
                this.state.vi_state.mode = "replace";
                this.state.cursorStyle = "under";
            }
        } else if (datatype === "repeat_mot") {
            const lastMotion = this.state.vi_lastFindMotion;
            if (lastMotion === null) {
                return 0;
            }
            // 入力(";" | ",")によって移動方向が反転するため、動的にoptionsを生成する
            const optionsFn = FIND_REPEAT_OPTIONS[lastMotion.name];
            this.moveUntilNextChar(lastMotion.arg, { limit: count, ...optionsFn(data.reverse) });
        } else if (datatype === "repeat_ope") {
            if (!this.state.vi_lastCmd) return 0;
            // this.vi_repeatOperator(this.state.vi_lastCmd);
            const lastCmd = this.state.vi_lastCmd;

            if (data.count) {
                // TODO: lastcmd.countを上書きできるかのフラグが必要, visualで選択した内容は上書きできない
                lastCmd.count = data.count; // 指定がある場合のみcountを上書きする
            }

            if (lastCmd.type === "operator") {
                const range = getMotionRange(this.state, lastCmd.motion, lastCmd.count);
                if (!range) return 0;
                this.vi_executeOperator({ operator: lastCmd.operator, range, linewise: range.linewise });
                if (lastCmd.operator === "c") {
                    this.vi_insertBuffer(this.state.vi_insertBuf);
                    this.vi_moveCursor(MOVE_KEYS.LEFT);
                }
            } else if (lastCmd.type === "insert") {
                this.vi_executeInsertImmediately(lastCmd.insertKind, lastCmd.count);
            } else if (lastCmd.type === "put") {
                this.vi_executePut(lastCmd.count, lastCmd.position);
            } else if (lastCmd.type === "join") {
                this.vi_executeJoin(lastCmd.count);
            }

        } else if (datatype === "undo") {
            for (let i = 0; i < count; i++) this.undo();

        } else if (datatype === "redo") {
            for (let i = 0; i < count; i++) this.redo();

        } else if (datatype === "scroll") {
            const kind = data.kind;
            if (data.count !== null) {
                this.state.vi_scrollAmount = count;
            }
            this.scrollCommandMap[kind](count);

        } else if (datatype === "visual") {
            const isLinewise = data.linemode;
            this.vi_goVisual(isLinewise);
            if (this.state.vi_state.mode !== "visual") throw new Error("vi_state.mode is not visual. call vi_goVisual() before this line");
            if (this.state.vi_state.linewise) {
                this.state.vi_state.visualFirst.col = 0;
                this.state.vi_state.visualLast.col = this.currentLine.size - 1;
            }
        }

        return 0;
    }

    private vi_executeVisual(input: readonly string[]): 0 | 1 | 2 {
        if (this.state.vi_state.mode !== "visual") throw new Error("vi_state.mode should be 'visual'");
        const vi_state = this.state.vi_state; // クロージャで使うためnarrow後にローカル変数にバインド
        const parseResult = parseVisualCommand(input);

        if (parseResult.status === "unknown") {
            console.log("its unknown");
            return 1;
        }
        if (parseResult.status === "pending") {
            console.log("its pending");
            return 2;
        }
        console.log("its ok");

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

        if (datatype === "switch_side") {
            const dest = (vi_state.rangeSide === "first") ? vi_state.visualLast : vi_state.visualFirst;
            this.moveCursorToPos(dest.row, dest.col);
            vi_state.rangeSide = (vi_state.rangeSide === "first") ? "last" : "first";

        } else if (datatype === "motion") {
            const motion = data.motion;
            if (motion.type === "find") {
                this.setLastFindMotion(motion);
            }
            if (motion.type === "textobj") {
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

        } else if (datatype === "repeat_mot") {
            const lastMotion = this.state.vi_lastFindMotion;
            if (lastMotion === null) {
                return 0;
            }
            // 入力(";" | ",")によって移動方向が反転するため、動的にoptionsを生成する
            const optionsFn = FIND_REPEAT_OPTIONS[lastMotion.name];
            this.moveUntilNextChar(lastMotion.arg, { limit: count, ...optionsFn(data.reverse) });
            syncCursorAndVisual();

        } else if (datatype === "operator") {
            if (this.state.vi_state.mode !== "visual")
                throw new Error("vi_state.mode should be 'visual'");
            const exclusiveRange =
                toExclusiveTextRange(vi_state.visualFirst, vi_state.visualLast, vi_state.linewise);
            const operator = data.operator;
            this.vi_executeOperator({ operator, range: exclusiveRange, linewise: vi_state.linewise });

            if (operator === "c") {
                this.vi_goInsert();
            } else {
                this.vi_goNormal();
            }

            // yankは繰り返さない
            if (operator === "y") return 0;

            // 繰り返しの登録
            if (operator === ">" || operator === "<") {
                const count = exclusiveRange.end.row - exclusiveRange.begin.row;
                // インデントコマンドの繰り返しにmotionは必要ではないが仮で定義する
                const motion: MotionContext = {
                    type: "linewise",
                    name: "line",
                };
                this.state.vi_lastCmd = { type: "operator", count, operator, motion };
            } else {
                if (vi_state.linewise) {
                    // 行単位の範囲は既存の型で代替できる
                    const motion: MotionContext = {
                        type: "linewise",
                        name: "line",
                    };
                    this.state.vi_lastCmd = { type: "operator", count, operator, motion };
                } else {
                    const motion: MotionContext = {
                        type: "offset_char",
                        lineCount: vi_state.lineCount,
                        charCount: vi_state.charCount,
                        destCol: vi_state.visualLast.col,
                    };
                    this.state.vi_lastCmd = { type: "operator", count, operator, motion };
                }
            }
        } else if (datatype === "put") {
            // レジスタが空でも実行する, その場合空文字に置き換える
            const saved = this.vi_executeOperator({
                operator: "d",
                range: toExclusiveTextRange(vi_state.visualFirst, vi_state.visualLast, vi_state.linewise),
                linewise: vi_state.linewise,
                writeRegister: false,
            });
            this.vi_executePut(count, "before");
            if (data.writeRegister) {
                writeClipboard(saved);
            }
            this.vi_goNormal();

        } else if (datatype === "join") {
            this.moveCursorToPos(vi_state.visualFirst.row, vi_state.visualFirst.col);
            this.vi_executeJoin(vi_state.lineCount);
            this.vi_goNormal();

        } else if (datatype === "replace") {
            for (let i = vi_state.visualFirst.row; i <= vi_state.visualLast.row; i++) {
                const line = this.state.lines[i];
                if (!line) throw new Error(`lines[${i}] is undefined`);
                const isFirst = (i === vi_state.visualFirst.row);
                const isLast  = (i === vi_state.visualLast.row);
                const orig = line.text;
                if (isFirst && isLast) {
                    const firstHalf = orig.slice(0, vi_state.visualFirst.col);
                    const middle = data.char.repeat(vi_state.visualLast.col - vi_state.visualFirst.col + 1);
                    const lastHalf = orig.slice(vi_state.visualFirst.col + vi_state.charCount);
                    line.text = firstHalf + middle + lastHalf;
                } else if (isFirst) {
                    const firstHalf = orig.slice(0, vi_state.visualFirst.col);
                    const lastHalf = data.char.repeat(orig.length - firstHalf.length);
                    line.text = firstHalf + lastHalf;
                } else if (isLast) {
                    const firstHalf = data.char.repeat(vi_state.visualLast.col + 1);
                    const lastHalf = orig.slice(vi_state.visualLast.col + 1);
                    line.text = firstHalf + lastHalf;
                } else {
                    const lineLen = orig.length;
                    line.text = data.char.repeat(lineLen);
                }
            }
            this.moveCursorToPos(vi_state.visualFirst.row, vi_state.visualFirst.col);
            this.vi_goNormal();
        }
        return 0;
    }

    private scrollCommandMap: Record<ScrollKind, (count: number) => void> = {
        "up-half": () => {
            for (let i = 0; i < this.state.vi_scrollAmount; i++) {
                this.vi_moveCursor(MOVE_KEYS.UP);
                this.scrollUp();
            }
        },
        "down-half": () => {
            for (let i = 0; i < this.state.vi_scrollAmount; i++) {
                this.vi_moveCursor(MOVE_KEYS.DOWN);
                this.scrollDown();
            }
        },
        "up-full": (count) => {
            for (let i = 0; i < count; i++) this.pageUp();
        },
        "down-full": (count) => {
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
        const lineNumberCols = this.config.lineNumberCols;
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
