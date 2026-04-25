import * as cmd from "./command";
import { CommandType, type CommandContext, type Count } from "./commandType";
import { MotionType, type MotionContext } from "./motionType";
import {
    ParseStatus,
    type CommandParseResult,
    type MotionParseResult,
    type ParserContext,
} from "./parseStatus";
import { STANDALONE_MAP } from "./standalone";
import { SUGAR_MAP } from "./sugar";
import { isDigitChar } from "../utils";
import { SCROLL_COMMAND_MAP } from "./scroll";

const ZERO_MOTION: MotionContext = {
    type: MotionType.CHAR,
    name: "0",
};

/**
 * - status: [ok, pending, unknown]
 **/
export function parseCommand(input: readonly string[]): CommandParseResult {
    let i = 0;
    const len = input.length;

    const ctx: ParserContext = {
        read: () => (i < len ? input[i] : ""),
        next: () => (i < len ? input[i++] : ""),
        eatDigits: () => {
            let s = "";
            if (ctx.read() === "0") return "0";
            while (isDigitChar(ctx.read()!)) s += ctx.next();
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

    if (first === ".") {
        const command: CommandContext = { type: CommandType.REPEAT_OPE, count };
        return { status: ParseStatus.OK, value: command };
    }
    if (first === ";" || first === ",") {
        const command: CommandContext = {
            type: CommandType.REPEAT_MOT,
            count,
            reverse: first === ",",
        };
        return { status: ParseStatus.OK, value: command };
    }

    function parseMotion(): MotionParseResult {
        const ch = ctx.next();
        if (!ch) return { status: ParseStatus.UNKNOWN };

        if (cmd.isFindCommand(ch)) {
            const arg = ctx.next();
            if (!arg) return { status: ParseStatus.PENDING };
            return { status: ParseStatus.OK, value: { type: MotionType.FIND, name: ch, arg } };
        }

        if (ch === "g") {
            if (ctx.read() === "g") {
                ctx.next();
                return { status: ParseStatus.OK, value: { type: MotionType.CHAR, name: "gg" } };
            }
            return { status: ParseStatus.PENDING }; // g単体は未確定
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
            ctx.next();
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

    if (cmd.isInsertCommand(first)) {
        ctx.next();
        const command: CommandContext = { type: CommandType.INSERT, count, command: first };
        return { status: ParseStatus.OK, value: command };
    }

    if (cmd.isSugar(first)) {
        ctx.next();
        const desugared = SUGAR_MAP[first];
        const operator = desugared.operator;
        const motion: MotionContext = desugared.motion;
        const command: CommandContext = {
            type: CommandType.OPERATOR,
            count,
            operator,
            innerCount: null,
            motion,
        };
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
        const innerCount: Count = innerCountStr === "" ? null : parseInt(innerCountStr, 10);

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

    if (cmd.isStandalone(first)) {
        ctx.next();
        const handler = STANDALONE_MAP[first];
        return handler(count);
    }

    if (cmd.isReplaceCommnad(first)) {
        ctx.next();
        const arg = ctx.read();
        if (!arg) return { status: ParseStatus.PENDING };
        const command: CommandContext = {
            type: CommandType.REPLACE,
            count,
            mode: {
                kind: "single",
                char: arg
            },
        };
        return { status: ParseStatus.OK, value: command };
    }

    if (cmd.isScrollCommand(first)) {
        ctx.next();
        const kind = SCROLL_COMMAND_MAP[first];
        const command: CommandContext = {
            type: CommandType.SCROLL,
            count,
            kind,
        };
        return { status: ParseStatus.OK, value: command };
    }

    if (first === "v" || first === "V") {
        const command: CommandContext = {
            type: CommandType.VISUAL,
            count,
            linemode: first === "V",
        };
        return { status: ParseStatus.OK, value: command };
    }

    if (cmd.isCaseSwitcher(first)) {
        const command: CommandContext = {
            type: CommandType.SWITCH_CASE,
            count,
        };
        return { status: ParseStatus.OK, value : command };
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
            const innerCount: Count = (innerCountStr === "") ? null : parseInt(innerCountStr, 10);

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
