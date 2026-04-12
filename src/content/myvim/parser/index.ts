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
            motion: { type: MotionType.CHAR, name: "0" },
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
            const motion: MotionContext = { type: MotionType.CHAR, name: "0" };
            const command: CommandContext = {
                type: CommandType.OPERATOR,
                count,
                operator,
                innerCount: null,
                motion,
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
            const motion: MotionContext = { type: MotionType.LINEWISE, name: "line" };
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
        return handler(ctx, count);
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

    // 以上の処理のどれにも当てはまらないときは移動入力として解析する
    const result = parseMotion();
    if (result.status !== ParseStatus.OK) {
        return { status: result.status };
    }
    const command: CommandContext = { type: CommandType.MOTION, count, motion: result.value };
    return { status: result.status, value: command };
}
