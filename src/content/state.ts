import { getHalfScreenRows, type EditorConfig } from "./config";
import { Line } from "./line";
import type { FindCommandName } from "./myvim/findCommand";
import type { InsertCommand } from "./myvim/insert";
import type { MotionContext } from "./myvim/motion";
import type { OperatorName } from "./myvim/operator";
import type { InclusivePos, Position } from "./types/motion";

type RepeatableCmd = { count: number } & (
    | { type: "operator", operator: Exclude<OperatorName, "YANK">, motion: MotionContext }
    | { type: "insert", insertKind: InsertCommand }
    | { type: "put", position: "before" | "after" }
    | { type: "join" }
);


export type EditorState = {
    row: number; // 現在の行数
    col: number; // 現在の行内の文字数
    px: number; // フォント幅を考慮したピクセル単位のx座標
    logicalWidth: number; // 全角半角を考慮した文字数(半角:1, 全角: 2)
    preferredWidth: number; // 最後に左右移動した値の保持
    rowoff: number; // 縦スクロール時の行のずれ
    logicaloff: number;
    lines: Line[];
    lastSnapshot: string;
    diffStack: string[];
    cursorStack: Position[];
    stackPtr: number;
    diffDirty: boolean;
    cursorStyle: "full" | "under" | "vertical";

    vi_state: ViState;
    vi_cmd: string[];
    vi_lastCmd: RepeatableCmd | null;
    vi_insertBuf: string[];
    vi_insertResolve: (() => void) | null;
    vi_yankLinewise: boolean;
    vi_lastFindMotion: { name: FindCommandName; arg: string } | null;
    vi_scrollAmount: number;
};

type ViState =
    | NormalState
    | InsertState
    | ReplaceState
    | VisualState

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

export function createEditorState(config: Readonly<EditorConfig>): EditorState {
    return {
        row: 0,
        col: 0,
        px: 0,
        logicalWidth: 0,
        preferredWidth: 0,
        rowoff: 0,
        logicaloff: 0,
        lines: [new Line()],
        lastSnapshot: "",
        diffStack: [],
        cursorStack: [],
        stackPtr: 0,
        diffDirty: false,

        vi_state: { mode: "normal" },
        vi_cmd: [],
        vi_lastCmd: null,
        vi_insertBuf: [""],
        vi_insertResolve: null,
        vi_yankLinewise: false,
        cursorStyle: "full",
        vi_lastFindMotion: null,
        vi_scrollAmount: getHalfScreenRows(config),
    };
}

export function resetState(state: EditorState, config: Readonly<EditorConfig>): void {
    state.row = 0;
    state.col = 0;
    state.px = 0;
    state.logicalWidth = 0;
    state.rowoff = 0;
    state.logicaloff = 0;
    state.lines = [new Line()];
    state.lastSnapshot = "";
    state.diffStack = [];
    state.cursorStack = [];
    state.stackPtr = 0;
    state.diffDirty = false;
    state.vi_state = { mode: "normal" };
    state.vi_cmd = [];
    state.vi_lastCmd = null;
    state.vi_insertBuf = [];
    state.vi_insertResolve = null;
    state.vi_yankLinewise = false;
    state.cursorStyle = "full";
    state.vi_lastFindMotion = null;
    state.vi_scrollAmount = getHalfScreenRows(config);
}
