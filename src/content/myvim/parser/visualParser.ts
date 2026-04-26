import * as cmd from "./normalCommand";
import * as visualCmd from "./visualCommand";
import { isDigitChar } from "../utils";
import { ParseStatus, type MotionParseResult, type ParserContext, type VisualCmdParseResult } from "./parseStatus";
import { CommandType, type NormalCmdContext } from "../normal";
import { MOTION_KEY_TO_NAME, MotionName, MotionType, type MotionContext } from "../motion";
import { toCount } from "./count";

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
        const command: NormalCmdContext = {
            type: CommandType.MOTION,
            count: null,
            motion: { type: MotionType.CHAR, name: MotionName.first },
        };
        return { status: ParseStatus.OK, value: command };
    }
    const count = toCount(countStr);

    const first = ctx.read();
    if (!first) {
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

    if (visualCmd.isNoArgCmdKey(first)) {
        const command = visualCmd.NO_ARG_CMD_MAP[first];
        return { status: ParseStatus.OK, value: command };
    }

    if (visualCmd.isWithCountCmdKey(first)) {
        const command = visualCmd.WITH_COUNT_CMD_MAP[first](count);
        return { status: ParseStatus.OK, value: command };
    }

    if (visualCmd.isWithArgCmdKey(first)) {
        ctx.next();
        const arg = ctx.read();
        if (!arg) return { status: ParseStatus.PENDING };
        const command = visualCmd.WITH_ARG_CMD_MAP[first](count, arg);
        return { status: ParseStatus.OK, value: command };
    }

    // 以上の処理のどれにも当てはまらないときは移動入力として解析する
    const result = parseMotion();
    if (result.status !== ParseStatus.OK) {
        return { status: result.status };
    }
    const command: NormalCmdContext = { type: CommandType.MOTION, count, motion: result.value };
    return { status: result.status, value: command };
}
