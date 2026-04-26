import * as cmd from "./command";
import * as visualCmd from "./visualType";
import { isDigitChar } from "../utils";
import { CommandType, type CommandContext } from "./commandType";
import { MotionType, type MotionContext } from "./motionType";
import { ParseStatus, type MotionParseResult, type ParserContext, type VisualCmdParseResult } from "./parseStatus";
import { VisualCmdType, type VisualCmdContext } from "./visualType";
import { MOTION_KEY_TO_NAME, MotionName } from "../motion";

export function parseVisualInput(input: readonly string[]): VisualCmdParseResult {
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
            motion: { type: MotionType.CHAR, name: MotionName.first },
        };
        return { status: ParseStatus.OK, value: command };
    }
    const count = countStr === "" ? null : parseInt(countStr, 10);

    const first = ctx.read();
    if (!first) {
        return { status: ParseStatus.PENDING };
    }

    if (first === ".") {
        // ビジュアルモードの間は繰り返しが無効
        return { status: ParseStatus.UNKNOWN };
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
                return { status: ParseStatus.OK, value: { type: MotionType.CHAR, name: MotionName.firstLine } };
            }
            return { status: ParseStatus.PENDING }; // g単体は未確定
        }

        if (cmd.isMotion(ch)) {
            const name = MOTION_KEY_TO_NAME[ch];
            return { status: ParseStatus.OK, value: { type: MotionType.CHAR, name } };
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
            }
        }

        return { status: ParseStatus.UNKNOWN };
    }

    if (visualCmd.isOperator(first)) {
        ctx.next();
        const command = visualCmd.OPERATOR_TO_CTX[first];
        return { status: ParseStatus.OK, value: command };
    }

    if (visualCmd.isIndentOperator(first)) {
        ctx.next();
        const command = visualCmd.INDENT_OPERATOR_TO_CTX[first](count);
        return { status: ParseStatus.OK, value: command };
    }

    if (visualCmd.isSugar(first)) {
        ctx.next();
        const command = visualCmd.SUGAR_TO_CTX[first];
        return { status: ParseStatus.OK, value: command };
    }

    const noArgCmd = visualCmd.NO_ARG_CMD_MAP[first as "o"]; // firstはstring型であり、Record型のインデックスになれないため型変換
    if (noArgCmd) {
        return { status: ParseStatus.OK, value: noArgCmd };
    }

    if (visualCmd.isInsertCommand(first)) {
        const value: VisualCmdContext = {
            type: VisualCmdType.INSERT,
            count,
            command: first,
        };
        return { status: ParseStatus.OK, value };
    }

    if (visualCmd.isPutCommand(first)) {
        const value = visualCmd.PUT_CMD_MAP[first](count);
        return { status: ParseStatus.OK, value };
    }

    if (visualCmd.isReplaceCommand(first)) {
        ctx.next();
        const arg = ctx.next();
        if (!arg) return { status: ParseStatus.PENDING };
        const value = visualCmd.REPLACE_CMD_MAP[first](count, arg);
        return { status: ParseStatus.OK, value };
    }

    // 以上の処理のどれにも当てはまらないときは移動入力として解析する
    const result = parseMotion();
    if (result.status !== ParseStatus.OK) {
        return { status: result.status };
    }
    const command: CommandContext = { type: CommandType.MOTION, count, motion: result.value };
    return { status: result.status, value: command };
}
