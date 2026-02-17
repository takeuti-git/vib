console.log("Alt+v: Focus canvas");

type EditorConfig = {
    fontFamily: string;
    fontColor: string;
    cursorColor: string;
    baseFontSize: number;
    lineHeight: number;
};

type VimMode = "normal" | "insert";

type VimState = {
    mode: VimMode,
    row: number;
    col: number;
    rowoff: number;
    coloff: number;
    screenrows: number;
    screencols: number;
    lastMaxCol: number;
};

type VimBuffer = {
    lines: Line[];
};

class Line {
    public text: string;
    constructor(text: string) {
        this.text = text;
    }

    public get size(): number {
        return this.text.length;
    }
}

const state: VimState = {
    mode: "normal",
    row: 0,
    col: 0,
    rowoff: 0,
    coloff: 0,
    screenrows: 10,
    screencols: 40,
    lastMaxCol: 0,
};
const buffer: VimBuffer = {
    lines: [
        new Line("12345678901234567890123456789023456789" ),
        new Line("hello world ハロー　ワールド!" ),
    ],
};

const container = document.createElement("div");
container.style.position = "fixed";
container.style.bottom = "50px";
container.style.right = "50px";
container.style.zIndex = "9999";
container.style.border = "1px solid black";
container.style.minWidth = "200px";

function isFullWidth(char: string): boolean {
    return /[^\x00-\x7F]/.test(char);
}

function drawEmpty(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const radius = config.baseFontSize / 8;
    ctx.fillStyle = "#ccc";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
}

function drawChar(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number) {
    ctx.fillStyle = config.fontColor;
    ctx.fillText(ch, x, y);
}

function drawLine(ctx: CanvasRenderingContext2D, line: Line, x: number, y: number) {
    let cursorX = x;

    for (const ch of line.text.slice(state.coloff)) {
        if (ch === " ") {
            drawEmpty(ctx, cursorX + config.baseFontSize / 4, y + config.lineHeight / 2);
        } else {
            drawChar(ctx, ch, cursorX, y + config.lineHeight / 2);
        }
        cursorX += isFullWidth(ch) ? config.baseFontSize : config.baseFontSize / 2;
    }
}

function drawLines(ctx: CanvasRenderingContext2D) {
    for (let y = 0; y < state.screenrows; y++) {
        const targetRow = y + state.rowoff;
        if (targetRow < buffer.lines.length) {
            drawLine(ctx, buffer.lines[targetRow]!, 0, y * config.lineHeight);
        }
    }
}

function drawCursor(
    ctx: CanvasRenderingContext2D,
) {
    const line = buffer.lines[state.row] as Line;
    const text = line.text;
    // const ch = text[startCol] ?? " ";

    const x = calcWidth(text.slice(0 + state.coloff, state.col));
    const y = (state.row - state.rowoff) * config.lineHeight;
    const w = calcWidth(text.slice(state.col, state.col + 1));
    const h = config.lineHeight;
    ctx.strokeRect(x, y, w, h);
}

function scroll() {
    if (state.row < state.rowoff) {
        state.rowoff = state.row;
    }
    if (state.row >= state.rowoff + state.screenrows) {
        state.rowoff = state.row - state.screenrows + 1;
    }
    if (state.col < state.coloff) {
        state.coloff = state.col;
    }
    if (state.col >= state.coloff + state.screencols) {
        state.coloff = state.col - state.screencols + 1;
    }
}

function calcWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += isFullWidth(ch) ? config.baseFontSize : config.baseFontSize / 2;
    }
    return width;
}

function clearCanvas(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

const config: EditorConfig = {
    fontFamily: "Consolas",
    fontColor: "green",
    cursorColor: "blue",
    baseFontSize: 16,
    lineHeight: 16,
};

function applyConfig(config: EditorConfig) {
    canvas.width = state.screencols * (config.baseFontSize / 2);
    canvas.height = state.screenrows * config.lineHeight;
    ctx.font = `${config.baseFontSize}px ${config.fontFamily}`;
    ctx.fillStyle = config.fontColor;
    ctx.strokeStyle = config.cursorColor;
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

applyConfig(config);
canvas.tabIndex = -1;
canvas.style.outline = "none";
ctx.textBaseline = "middle";

container.appendChild(canvas);
document.body.appendChild(container);


const isFunctionKey = (key: string) => /^F\d+/.test(key);
const IGNORE_KEYS = [
    "Escape", "Delete", "Insert",
    "Enter", "Control", "Shift", "Alt", "Meta",
    "Alphanumeric", "Tab", "Backspace", "Convert", "NonConvert",
    "Hiragana", "Zenkaku",
    "Home", "End", "PageUp", "PageDown", "Clear",
    "NumLock", "ContextMenu",
];

document.addEventListener("keydown", (e) => {
    // processing
    processKeypress(e);
    scroll();

    // drawing
    clearCanvas(ctx);
    drawLines(ctx);
    drawCursor(ctx);
});

const MOVE_KEYS = {
    LEFT: "LEFT",
    RIGHT: "RIGHT",
    UP: "UP",
    DOWN: "DOWN",
} as const;

type MoveKey = keyof typeof MOVE_KEYS;

function moveCursor(key: MoveKey) {
    switch (key) {
        case MOVE_KEYS.LEFT: {
            if (state.col !== 0) {
                state.col--;
            } else if (state.row > 0) {
                const prevLineLen = buffer.lines[state.row - 1]!.size;
                state.row--;
                state.col = prevLineLen;
            }
            state.lastMaxCol = state.col;
            break;
        }
        case MOVE_KEYS.RIGHT: {
            const curLine = buffer.lines[state.row] as Line;
            if (state.col < curLine.size) {
                state.col++;
            } else if (buffer.lines[state.row + 1] && state.col === curLine.size) {
                state.row++;
                state.col = 0;
            }
            state.lastMaxCol = state.col;
            break;
        }
        case MOVE_KEYS.UP: {
            if (state.row !== 0) {
                const prevLineLen = buffer.lines[state.row - 1]!.size;
                state.col = Math.min(prevLineLen, state.lastMaxCol);
                state.row--;
            }
            break;
        }
        case MOVE_KEYS.DOWN: {
            if (state.row < buffer.lines.length - 1) {
                const nextLineLen = buffer.lines[state.row + 1]!.size;
                state.col = Math.min(nextLineLen, state.lastMaxCol);
                state.row++;
            }
            break;
        }
    }
}

function insertRow(at: number, text: string) {
    if (at < 0 || at > buffer.lines.length) return;
    buffer.lines.splice(at, 0, new Line(text));
}

function deleteRow(at: number) {
    if (at < 0 || at >= buffer.lines.length) return;
    buffer.lines.splice(at, 1);
}

function appendTextToLine(line: Line, text: string) {
    line.text += text;
}

function insertNewLine() {
    const line = buffer.lines[state.row] as Line;
    const buf = line.text.slice(state.col);
    line.text = line.text.slice(0, state.col);
    state.row++;
    state.col = 0;
    state.lastMaxCol = state.col;
    insertRow(state.row, buf);
}

function insertChar(ch: string) {
    if (IGNORE_KEYS.includes(ch)) return;

    const line = buffer.lines[state.row] as Line;
    if (state.col >= line.size) {
        line.text += ch;
    } else {
        line.text = line.text.slice(0, state.col) + ch + line.text.slice(state.col);
    }
    state.col++;
    state.lastMaxCol = state.col;
}

function deleteChar() {
    if (state.col === 0 && state.row === 0) return;

    const line = buffer.lines[state.row] as Line;
    const text = line.text;
    if (state.col > 0) {
        const buf = text.slice(0, state.col - 1) + text.slice(state.col);
        line.text = buf;
        state.col--;
        state.lastMaxCol = state.col;
    } else {
        // append two lines
        const prevLine = buffer.lines[state.row - 1] as Line;
        state.col = prevLine.size;
        state.lastMaxCol = state.col;
        appendTextToLine(prevLine, line.text);
        deleteRow(state.row);
        state.row--;
    }
}

function processKeypress(e: KeyboardEvent) {
    const key = e.key;
    if (isFunctionKey(key)) {
        return;
    }
    if (e.altKey && e.code === "KeyV") {
        canvas.focus();
        return;
    }

    if (document.activeElement !== canvas) {
        console.log("canvas is not focused");
        return;
    }

    switch (key) {
        case "ArrowLeft":
            moveCursor(MOVE_KEYS.LEFT);
            break;
        case "ArrowRight":
            moveCursor(MOVE_KEYS.RIGHT);
            break;
        case "ArrowUp":
            moveCursor(MOVE_KEYS.UP);
            break;
        case "ArrowDown":
            moveCursor(MOVE_KEYS.DOWN);
            break;

        case "Delete":
        case "Backspace": {
            if (key === "Delete") {
                if (
                    state.row === buffer.lines.length - 1 &&
                    state.col === buffer.lines[state.row]!.size
                ) return;
                moveCursor(MOVE_KEYS.RIGHT);
            }
            deleteChar();
            break;
        }
        case "Enter": {
            insertNewLine();
            break;
        }
        default: {
            insertChar(key);
        }
    }
}
