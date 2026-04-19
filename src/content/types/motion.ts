export type RC = {
    row: number;
    col: number;
};

export type InclusivePos = {
    row: number;
    col: number;
}

export type ExclusivePos = {
    row: number;
    col: number;
};

export type TextRange = {
    start: InclusivePos;
    end: ExclusivePos;
};

export type MotionRange = TextRange & {
    linewise: boolean;
};
