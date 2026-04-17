export type RC = {
    row: number;
    col: number;
};

export type TextRange = {
    start: RC;
    end: RC;
};

export type MotionRange = TextRange & {
    linewise: boolean;
};
