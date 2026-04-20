export type Position = {
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
    begin: InclusivePos;
    end: ExclusivePos;
};

export type MotionRange = TextRange & {
    linewise: boolean;
};
