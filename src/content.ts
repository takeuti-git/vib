console.log("Alt+v: Focus canvas");
// const link = document.createElement("link");
// link.rel = "stylesheet";
// link.href = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap";
// document.head.appendChild(link);

type VimMode = "normal" | "insert";

type VimMotionState = {
    col: number;
    row: number;
    lastMaxCol: number;
};

type VimState = {
    mode: VimMode,
    motion: VimMotionState,
};

type VimBuffer = {
    cmd: string,
    lastCmd: RepeatableCmd | null,
};

const state: VimState = {
    mode: "normal",
    motion: {
        col: 0,
        row: 0,
        lastMaxCol: 0,
    },
};
const buffer: VimBuffer = {
    cmd: "",
    lastCmd: null,
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
        ctx.fillText(ch, cursorX, y + lineHeight / 2);
        cursorX += isFullWidth(ch) ? baseFontSize : baseFontSize / 2;
    }
}

function calcWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += isFullWidth(ch) ? baseFontSize : baseFontSize / 2;
    }
    return width;
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
canvas.width = 300;
canvas.height = 200;
canvas.tabIndex = -1;
canvas.style.outline = "none";
const baseFontSize = 16;
const baseFontSizeHalved = baseFontSize / 2;
const lineHeight = baseFontSize + (baseFontSize / 4);
const lineN = (line: number): number => line * lineHeight;
// ctx.font = `${baseFontSize}px "JetBrains Mono", monospace`;
ctx.font = `${baseFontSize}px Consolas`;
ctx.fillStyle = "green";
ctx.strokeStyle = "blue";
ctx.textBaseline = "middle";

const text1 = "1122334455667";
const text2 = "あいうえお";
const text3 = "hello, world!";

container.appendChild(canvas);
document.body.appendChild(container);


const IGNORE_KEYS = ["F5", "F12"];
document.addEventListener("keydown", (e) => {
    const key = e.key;

    if (IGNORE_KEYS.includes(key)) {
        // always ignore these keys
        return;
    }

    e.preventDefault();

    if (e.altKey && e.code === "KeyV") {
        canvas.focus();
    }

    if (document.activeElement !== canvas) {
        console.log("canvas is not focused");
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawText(ctx, text1, 0, lineN(0));
    drawText(ctx, text2, 0, lineN(1));
    drawText(ctx, text3, 0, lineN(2));

    if (key === "h") {
        state.motion.col = Math.max(0, state.motion.col - 1);
    }
    if (key === "l") state.motion.col++;
    if (key === "k") {
        state.motion.row = Math.max(0, state.motion.row - 1);
    }
    if (key === "j") state.motion.row++;
    const x = state.motion.col * baseFontSizeHalved;
    const y = state.motion.row * lineHeight;
    ctx.strokeRect(x, y, baseFontSizeHalved, lineHeight);
});

const N_CMDS = [
    ".",
    "i",
    "h", "j", "k", "l",
] as const;

type NormalCmd = (typeof N_CMDS)[number];

function isValidCmd(cmd: string): cmd is NormalCmd {
    return N_CMDS.some(c => c.startsWith(cmd));
}

const REPEATABLE_CMDS = [
    "p", "P",
    "dd", "x", "X",
] as const;

type RepeatableCmd = (typeof REPEATABLE_CMDS)[number];

function isRepeatableCmd(cmd: string): cmd is RepeatableCmd {
    return (REPEATABLE_CMDS as readonly string[]).includes(cmd);
}
