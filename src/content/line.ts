export class Line {
    public text: string;
    constructor(text: string) {
        this.text = text;
    }

    public get size(): number {
        return this.text.length;
    }
}

