import * as cmd from "./normalCommand";
import * as visualCmd from "./visualCommand";
import { isDigitChar } from "../utils";
import {
    OK,
    ParseStatus,
    PENDING,
    UNKNOWN,
    type MotionParseResult,
    type ParserContext,
    type VisualCmdParseResult,
} from "./parseStatus";
import { NormalCmdType } from "../normal";
import { MOTION_KEY_TO_NAME, MotionName, MotionType } from "../motion";
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
        return OK({
            type: NormalCmdType.MOTION,
            count: null,
            motion: { type: MotionType.CHAR, name: MotionName.first },
        });
    }
    const count = toCount(countStr);

    const first = ctx.read();
    if (!first) return PENDING;

    function parseMotion(): MotionParseResult {
        const ch = ctx.next();
        if (!ch) return UNKNOWN;

        if (cmd.isFindCommand(ch)) {
            const arg = ctx.next();
            if (!arg) return PENDING;
            return OK({
                type: MotionType.FIND,
                name: ch,
                arg,
            });
        }

        if (ch === "g") {
            if (!ctx.read()) return PENDING;

            if (ctx.read() === "g") {
                ctx.next();
                return OK({
                    type: MotionType.CHAR,
                    name: MotionName.firstLine,
                });
            }
        }

        if (cmd.isMotion(ch)) {
            const name = MOTION_KEY_TO_NAME[ch];
            return OK({
                type: MotionType.CHAR,
                name,
            });
        }

        if (cmd.isTextObjectModifier(ch)) {
            const char = ctx.read();
            if (!char) return PENDING;
            ctx.next();

            if (!cmd.isTextObjectType(char)) return UNKNOWN;
            return OK({
                type: MotionType.TEXTOBJ,
                inner: ch === "i",
                name: char,
            });
        }

        return UNKNOWN;
    }

    if (visualCmd.isNoArgCmdKey(first)) {
        const command = visualCmd.NO_ARG_CMD_MAP[first];
        return OK(command);
    }

    if (visualCmd.isWithCountCmdKey(first)) {
        const command = visualCmd.WITH_COUNT_CMD_MAP[first](count);
        return OK(command);
    }

    if (visualCmd.isWithArgCmdKey(first)) {
        ctx.next();
        const arg = ctx.read();
        if (!arg) return PENDING;
        const command = visualCmd.WITH_ARG_CMD_MAP[first](count, arg);
        return OK(command);
    }

    // 以上の処理のどれにも当てはまらないときは移動入力として解析する
    const result = parseMotion();
    if (result.status !== ParseStatus.OK) {
        return { status: result.status };
    }
    return OK({ type: NormalCmdType.MOTION, count, motion: result.value });
}
