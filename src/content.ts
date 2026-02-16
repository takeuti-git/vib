console.log("Alt+v: Focus canvas");
// const link = document.createElement("link");
// link.rel = "stylesheet";
// link.href = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap";
// document.head.appendChild(link);

type VimMode = "normal" | "insert";

type VimState = {
    mode: VimMode,
    row: number;
    col: number;
    lastMaxCol: number;
};

type VimBuffer = {
    lines: Line[];
};

type Line = {
    text: string;
};

const state: VimState = {
    mode: "normal",
    col: 0,
    row: 0,
    lastMaxCol: 0,
};
const buffer: VimBuffer = {
    lines: [{ text: "hello ハロー world ワールド!" }],
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

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    let cursorX = x;

    for (const ch of text) {
        if (ch === " ") {
            ctx.fillStyle = "#ccc";
            ctx.beginPath();
            const x = cursorX + (baseFontSize / 4);
            ctx.arc(x, y + lineHeight / 2, baseFontSize / 8, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillStyle = "green";
            ctx.fillText(ch, cursorX, y + lineHeight / 2);
        }
        cursorX += isFullWidth(ch) ? baseFontSize : baseFontSize / 2;
    }
}

function drawCursor(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    startCol: number,
    endRow: number = startRow,
    endCol: number = startCol,
) {
    const line = buffer.lines[startRow] as Line;
    const text = line.text;
    // const ch = text[startCol] ?? " ";

    let x;
    let y;
    let w;

    x = calcWidth(text.slice(0, startCol));
    y = startRow * lineHeight;
    w = calcWidth(text.slice(startCol, endCol + 1));
    const h = lineHeight;
    ctx.strokeRect(x, y, w, h);
}

function calcWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += isFullWidth(ch) ? baseFontSize : baseFontSize / 2;
    }
    return width;
}

function clearCanvas(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
canvas.width = 300;
canvas.height = 160;
canvas.tabIndex = -1;
canvas.style.outline = "none";
const baseFontSize = 16;
const lineHeight = baseFontSize// + (baseFontSize / 4);
const lineN = (line: number): number => line * lineHeight;
// ctx.font = `${baseFontSize}px "JetBrains Mono", monospace`;
ctx.font = `${baseFontSize}px Consolas`;
ctx.fillStyle = "green";
ctx.strokeStyle = "blue";
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
    processKeypress(e);

    clearCanvas(ctx);
    for (let i = 0; i < buffer.lines.length; i++) {
        drawText(ctx, buffer.lines[i]!.text, 0, lineN(i));
    }

    // drawCursor(ctx, state.row, state.col, state.row, state.col + 1);
    drawCursor(ctx, state.row, state.col);
});

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

    if (key === "ArrowLeft") {
        state.col = Math.max(0, state.col - 1);
        state.lastMaxCol = state.col;
    }
    else if (key === "ArrowRight") {
        state.col = Math.min(buffer.lines[state.row]!.text.length, state.col + 1);
        state.lastMaxCol = state.col;
    }
    else if (key === "ArrowUp") {
        state.row = Math.max(0, state.row - 1);
        const prevLinelen = buffer.lines[state.row]!.text.length;
        state.col = Math.min(prevLinelen, state.lastMaxCol);
    }
    else if (key === "ArrowDown") {
        state.row = Math.min(buffer.lines.length - 1, state.row + 1);
        const nextLineLen = buffer.lines[state.row]!.text.length;
        state.col = Math.min(nextLineLen, state.lastMaxCol);
    }
    else if (key === "Enter") {
        const line = buffer.lines[state.row] as Line;
        const buf = line.text.slice(state.col);
        line.text = line.text.slice(0, state.col);
        state.row++;
        state.col = 0;
        state.lastMaxCol = state.col;
        buffer.lines.splice(state.row, 0, { text: buf });
    }
    else if (key === "Backspace") {
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
            state.col = prevLine.text.length;
            state.lastMaxCol = state.col;
            prevLine.text += text;
            buffer.lines.splice(state.row, 1);
            state.row--;
        }
    }
    else {
        if (IGNORE_KEYS.includes(key)) return;

        const line = buffer.lines[state.row] as Line;
        if (state.col >= line.text.length) {
            line.text += key;
        } else {
            line.text = line.text.slice(0, state.col) + key + line.text.slice(state.col);
        }
        state.col++;
        state.lastMaxCol = state.col;
    }
}
