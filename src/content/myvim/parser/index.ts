import * as cmd from "./command";
import { CommandType, type CommandContext } from "./commandType";
import { MotionType, type MotionContext } from "./motionType";
import {
    ParseStatus,
    type CommandParseResult,
    type MotionParseResult,
    type ParserContext,
} from "./parseStatus";
import { NO_ARG_CMD_MAP } from "./noArgs";
import { isDigitChar } from "../utils";

const ZERO_MOTION: MotionContext = {
    type: MotionType.CHAR,
    name: "0",
};

/**
 * - status: unknown | pending | ok
 **/
export function parseCommand(input: readonly string[]): CommandParseResult {
    let i = 0;
    const len = input.length;

    const ctx: ParserContext = {
        read: () => (i < len ? input[i] : ""),
        next: () => (i < len ? input[i++] : ""),
        eatDigits: () => {
            let s = "";
            if (ctx.read() === "0") return ctx.next() as string;
            while (isDigitChar(ctx.read() as string)) s += ctx.next();
            return s;
        },
    };

    const countStr = ctx.eatDigits();
    if (countStr === "0") {
        const command: CommandContext = {
            type: CommandType.MOTION,
            count: null,
            motion: ZERO_MOTION,
        };
        return { status: ParseStatus.OK, value: command };
    }
    const count = countStr === "" ? null : parseInt(countStr, 10);

    const first = ctx.read();
    if (!first) {
        // 数値以外の入力がない状態
        return { status: ParseStatus.PENDING };
    }

    function parseMotion(): MotionParseResult {
        const ch = ctx.next();
        if (!ch) return { status: ParseStatus.UNKNOWN };

        if (cmd.isFindCommand(ch)) {
            const arg = ctx.next();
            if (!arg) return { status: ParseStatus.PENDING };
            return { status: ParseStatus.OK, value: { type: MotionType.FIND, name: ch, arg } };
        }

        if (cmd.isMotion(ch)) {
            return { status: ParseStatus.OK, value: { type: MotionType.CHAR, name: ch } };
        }

        if (cmd.isTextObjectModifier(ch)) {
            const char = ctx.read();
            if (!char) {
                // "da"で入力を待っているような状態
                return { status: ParseStatus.PENDING };
            }
            if (cmd.isTextObjectType(char)) {
                const motion: MotionContext = {
                    type: MotionType.TEXTOBJ,
                    inner: ch === "i",
                    name: char,
                };
                return { status: ParseStatus.OK, value: motion };
            } else {
                return { status: ParseStatus.UNKNOWN };
            }
        }

        return { status: ParseStatus.UNKNOWN };
    }

    const noArgCmd = NO_ARG_CMD_MAP[first as "i"];
    if (noArgCmd) {
        const command = noArgCmd(count);
        return { status: ParseStatus.OK, value: command };
    }

    if (cmd.isOperator(first)) {
        ctx.next(); // 次の文字を見るためポインターを進める
        const operator = first;

        const afterOperator = ctx.read();
        if (!afterOperator) {
            return { status: ParseStatus.PENDING };
        }

        const innerCountStr = ctx.eatDigits();
        if (innerCountStr === "0") {
            const command: CommandContext = {
                type: CommandType.OPERATOR,
                count,
                operator,
                innerCount: null,
                motion: ZERO_MOTION,
            };
            return { status: ParseStatus.OK, value: command };
        }
        const innerCount = innerCountStr === "" ? null : parseInt(innerCountStr, 10);

        const afterInnerCount = ctx.read();
        if (!afterInnerCount) {
            return { status: ParseStatus.PENDING };
        }
        // operatorが同じ2文字の場合は特殊処理。 ex: dd, cc
        if (afterInnerCount === operator || afterInnerCount === "_") {
            const motion: MotionContext = { type: MotionType.LINEWISE };
            const command: CommandContext = {
                type: CommandType.OPERATOR,
                count,
                operator,
                innerCount,
                motion,
            };
            return { status: ParseStatus.OK, value: command };
        }

        const result = parseMotion();
        if (result.status !== ParseStatus.OK) {
            return { status: result.status };
        }

        const command: CommandContext = {
            type: CommandType.OPERATOR,
            count,
            operator,
            innerCount,
            motion: result.value,
        };
        return { status: ParseStatus.OK, value: command };
    }

    if (cmd.isReplaceCommnad(first)) {
        ctx.next();
        const arg = ctx.read();
        if (!arg) return { status: ParseStatus.PENDING };
        const command: CommandContext = {
            type: CommandType.REPLACE,
            count,
            arg,
        };
        return { status: ParseStatus.OK, value: command };
    }

    if (first === "g") {
        ctx.next(); // firstを消費する

        if (!ctx.read()) { // gの次の文字がないなら保留
            return { status: ParseStatus.PENDING };
        }

        const second = ctx.next();

        if (second === "g") {
            // 最初の行に移動する
            const command: CommandContext = {
                type: CommandType.MOTION,
                count,
                motion: { type: MotionType.CHAR, name: "gg" },
            };
            return { status: ParseStatus.OK, value: command };
        } else if (second === "u" || second === "U") {
            // {count}gu{count}{motion}: motionの範囲を小文字に変換する, gugu / guuなら現在行を小文字にする
            // {count}gU{count}{motion}: motionの範囲を大文字に変換する, gUgU / gUUなら現在行を大文字にする
            if (!ctx.read()) {
                return { status: ParseStatus.PENDING };
            }

            const innerCountStr = ctx.eatDigits();
            if (innerCountStr === "0") {
                const command: CommandContext = {
                    type: CommandType.TO_LOWER,
                    count,
                    innerCount: null,
                    motion: ZERO_MOTION,
                };
                return { status: ParseStatus.OK, value: command };
            }
            const innerCount = (innerCountStr === "") ? null : parseInt(innerCountStr, 10);

            const afterInnerCount = ctx.read();
            if (!afterInnerCount) {
                return { status: ParseStatus.PENDING };
            }

            const type = (second === "u") ? CommandType.TO_LOWER : CommandType.TO_UPPER;
            const third = ctx.read();
            if (third === "g") {
                ctx.next();
                // gug / gUg の状態
                const fourth = ctx.read();
                if (!fourth) return { status: ParseStatus.PENDING };
                if (fourth === "g") {
                    // gugg / gUgg の状態
                    const command: CommandContext = {
                        type,
                        count,
                        innerCount,
                        motion: { type: "char", name: "gg" },
                    };
                    return { status: ParseStatus.OK, value: command };
                } else if (second === fourth) {
                    // gugu / gUgU の状態
                    const command: CommandContext = {
                        type,
                        count,
                        innerCount,
                        motion: { type: "linewise" }
                    };
                    return { status: ParseStatus.OK, value: command };
                }
                return { status: ParseStatus.UNKNOWN };
            } else if (second === third) {
                // guu / gUU の状態
                const command: CommandContext = {
                    type,
                    count,
                    innerCount,
                    motion: { type: "linewise" },
                };
                return { status: ParseStatus.OK, value: command };
            }

            const motionResult = parseMotion();
            if (motionResult.status !== ParseStatus.OK) {
                return { status: motionResult.status };
            }
            const command: CommandContext = {
                type,
                count,
                innerCount,
                motion: motionResult.value,
            };
            return { status: ParseStatus.OK, value: command };
        }
    }

    // 以上の処理のどれにも当てはまらないときは移動入力として解析する
    const result = parseMotion();
    if (result.status !== ParseStatus.OK) {
        return { status: result.status };
    }
    const command: CommandContext = { type: CommandType.MOTION, count, motion: result.value };
    return { status: result.status, value: command };
}
