export class Line {
    public text: string;
    constructor(text: string = "") {
        this.text = text;
    }

    public get size(): number {
        return this.text.length;
    }

    public isEmpty(): boolean {
        return this.text === "";
    }
}

export function getLines(text: string): Line[] {
    return text.split("\n").map((line) => new Line(line));
}

/**
 * - Line配列のtextを連結した文字列を返す
 * - sepの初期値は"\n"
 * */
export function joinLines(lines: Line[], sep = "\n"): string {
    return lines.map((l) => l.text).join(sep);
}
