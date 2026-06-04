import { getHalfScreenRows, type EditorConfig } from "./config";
import { Line } from "./line";
import type { FindCommandName } from "./myvim/findCommand";
import type { InsertCommand } from "./myvim/insert";
import { createMacroTable, type MacroChar, type MacroTable } from "./myvim/macro";
import type { MotionContext } from "./myvim/motion";
import type { OperatorName } from "./myvim/operator";
import type { InclusivePos } from "./types/motion";
import type { DiffStackElement } from "./types/patch";

type RepeatableCmd = { count: number } & (
    | { type: "operator", operator: Exclude<OperatorName, "YANK">, motion: MotionContext }
    | { type: "insert", insertKind: InsertCommand }
    | { type: "put", position: "before" | "after" }
    | { type: "join" }
);

export type EditorState = {
    cursor: CursorState;
    scroll: ScrollState;
    lines: Line[];
    diff: DiffState;
    vi: ViEditorState;
};

type CursorState = {
    row: number;
    col: number;       // 文字数基準のカーソルの列位置
    visualCol: number; // colまでの全角半角幅を考慮したカーソル位置(半角:1,全角:2)
    prefVisualCol: number;
    style: "full" | "under" | "vertical";
};

type ScrollState = {
    rowoff: number;       // 縦スクロール時の行のずれ
    visualColoff: number; // 横スクロール時の列のずれ
};

type DiffState = {
    stack: DiffStackElement[];
    stackPtr: number;
    lastSnapshot: string; // diff検出の比較に用いる
    disableSave: boolean; // 差分保存を割り込みで無効化するフラグ
};

type ViEditorState = {
    state: ViState;
    cmd: string[];
    lastCmd: RepeatableCmd | null;
    insertBuf: string[];
    insertResolve: (() => void) | null;
    yankLinewise: boolean;
    lastFindMotion: { name: FindCommandName; arg: string } | null;
    scrollAmount: number; // 一部のコマンド入力によるスクロールの行数
    callbackOnSuccess: (() => void) | null;
    macro: ViMacroState;
    lastSearchBuf: string | null;
    searchDir: "fw" | "bw";
};

type ViMacroState = {
    table: MacroTable;
    recording: MacroChar | null;
    lastPlayed: MacroChar | null;
    callback: (() => void) | null;
};

type Satisfies<Constraint, Target extends Constraint> = Target;

type ViState = Satisfies<
    { mode: string },
    NormalState | InsertState | ReplaceState | VisualState | CommandState | SearchState
>;

type NormalState = {
    mode: "normal";
};

export type VisualState = {
    mode: "visual";
    rangeSide: "first" | "last";
    visualFirst: InclusivePos;
    visualLast: InclusivePos;
    linewise: boolean;
    charCount: number;
    lineCount: number;
};

type InsertState = {
    mode: "insert";
};

type ReplaceState = {
    mode: "replace";
};

type CommandState = {
    mode: "command";
    /** statusBarCol */
    sBarCol: number;
    /** statusBarVisualCol */
    sBarVisualCol: number;
};

type SearchState = {
    mode: "search";
    /** statusBarCol */
    sBarCol: number;
    /** statusBarVisualCol */
    sBarVisualCol: number;
    // direction: "forward" | "backward";
};

export function createEditorState(config: Readonly<EditorConfig>): EditorState {
    return {
        cursor: {
            row: 0,
            col: 0,
            visualCol: 0,
            prefVisualCol: 0,
            style: "full",
        },
        scroll: {
            rowoff: 0,
            visualColoff: 0,
        },
        lines: [new Line()],
        diff: {
            stack: [],
            stackPtr: 0,
            lastSnapshot: "",
            disableSave: false,
        },
        vi: {
            state: {
                mode: "normal",
            },
            cmd: [],
            lastCmd: null,
            insertBuf: [],
            insertResolve: null,
            yankLinewise: false,
            lastFindMotion: null,
            scrollAmount: getHalfScreenRows(config),
            macro: {
                table: createMacroTable(),
                recording: null,
                lastPlayed: null,
                callback: null,
            },
            callbackOnSuccess: null,
            lastSearchBuf: null,
            searchDir: "fw",
        },
    };
}

export function resetState(state: EditorState, config: Readonly<EditorConfig>): void {
    state.cursor.row = 0;
    state.cursor.col = 0;
    state.cursor.visualCol = 0;
    state.cursor.prefVisualCol = 0;
    state.cursor.style = "full";

    state.scroll.rowoff = 0;
    state.scroll.visualColoff = 0;

    state.lines = [new Line()];

    state.diff.stack = [];
    state.diff.stackPtr = 0;
    state.diff.lastSnapshot = "";
    state.diff.disableSave = false;

    state.vi.state = { mode: "normal" };
    state.vi.cmd = [];
    state.vi.lastCmd = null;
    state.vi.insertBuf = [];
    state.vi.insertResolve = null;
    state.vi.yankLinewise = false;
    state.vi.lastFindMotion = null;
    state.vi.scrollAmount = getHalfScreenRows(config);
    state.vi.callbackOnSuccess = null;

    state.vi.macro.recording = null;
    state.vi.macro.callback = null;
}
