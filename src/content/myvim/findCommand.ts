import type { FindCommand } from "./parser/normalCommand";

export type FindMoveOptions = {
    reverse: boolean;
    stopBefore: boolean;
    limit?: number;
    ignoreNextCh?: boolean;
};

/** parserで定義したコマンドを中継するだけ */
export type FindCommandName = FindCommand;

export const FIND_COMMAND_OPTIONS: Record<FindCommandName, FindMoveOptions> = {
    f: { reverse: false, stopBefore: false },
    F: { reverse: true, stopBefore: false },
    t: { reverse: false, stopBefore: true },
    T: { reverse: true, stopBefore: true },
} as const;

/**
 * - 動的にオプションを生成する
 * - セミコロンとカンマで移動方向が変わるため
 * */
export const FIND_REPEAT_OPTIONS: Record<FindCommandName, (reverse: boolean) => FindMoveOptions> = {
    f: (reverse) => ({ reverse, stopBefore: false, ignoreNextCh: false }),
    F: (reverse) => ({ reverse: !reverse, stopBefore: false, ignoreNextCh: false }),
    t: (reverse) => ({ reverse, stopBefore: true, ignoreNextCh: true }),
    T: (reverse) => ({ reverse: !reverse, stopBefore: true, ignoreNextCh: true }),
} as const;
