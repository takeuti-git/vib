import * as cmd from "./normalCommand";
import {
    OK,
    ParseStatus,
    PENDING,
    UNKNOWN,
    type NormalCmdParseResult,
    type MotionParseResult,
    type ParserContext,
} from "./parseStatus";
import { isNoArgCmd, isWithArgCmd, NO_ARG_CMD_MAP, WITH_ARG_CMD_MAP } from "./normalCmdMap";
import { isDigitChar } from "../utils";
import { toCount } from "./count";
import { MOTION_KEY_TO_NAME, MotionName, MotionType, type MotionContext } from "../motion";
import { NormalCmdType } from "../normal";
import { OPERATOR_KEY_TO_NAME } from "../operator";

const ZERO_MOTION: MotionContext = {
    type: MotionType.CHAR,
    name: MotionName.first,
};

/**
 * - status: unknown | pending | ok
 **/
export function parseNormalInput(input: readonly string[]): NormalCmdParseResult {
    let i = 0;
    const len = input.length;

    const ctx: ParserContext = {
        read: () => (i < len ? input[i] : ""),
        next: () => (i < len ? input[i++] : ""),
        eatDigits: () => {
            if (ctx.read() === "0") return ctx.next() as string;
            let s = "";
            while (isDigitChar(ctx.read() as string)) s += ctx.next();
            return s;
        },
    };

    const countStr = ctx.eatDigits();
    if (countStr === "0") {
        return OK({
            type: NormalCmdType.MOTION,
            count: null,
            motion: ZERO_MOTION,
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
            if (!cmd.isTextObjectType(char)) return UNKNOWN;
            return OK({
                type: MotionType.TEXTOBJ,
                inner: ch === "i",
                name: char,
            });
        }

        return UNKNOWN;
    }

    if (isNoArgCmd(first)) {
        const command = NO_ARG_CMD_MAP[first](count);
        return OK(command);
    }

    if (isWithArgCmd(first)) {
        ctx.next();
        const arg = ctx.read();
        if (!arg) return PENDING;
        const command = WITH_ARG_CMD_MAP[first](count, arg)
        return OK(command);
    }

    if (cmd.isOperator(first)) {
        ctx.next(); // 次の文字を見るためポインターを進める
        const operator = first;
        const operatorName = OPERATOR_KEY_TO_NAME[first];

        const afterOperator = ctx.read();
        if (!afterOperator) return PENDING;

        const innerCountStr = ctx.eatDigits();
        if (innerCountStr === "0") {
            return OK({
                type: NormalCmdType.OPERATOR,
                count,
                operator: operatorName,
                innerCount: null,
                motion: ZERO_MOTION,
            });
        }
        const innerCount = toCount(innerCountStr);

        const afterInnerCount = ctx.read();
        if (!afterInnerCount) return PENDING;

        const cmd = (motion: MotionContext) => OK({
            type: NormalCmdType.OPERATOR, count, innerCount, operator: operatorName, motion
        });

        // operatorが同じ2文字の場合は特殊処理。 ex: dd, cc
        if (afterInnerCount === operator || afterInnerCount === "_") {
            return cmd({ type: MotionType.LINEWISE });
        }

        const result = parseMotion();
        if (result.status !== ParseStatus.OK) {
            return { status: result.status };
        }

        return cmd(result.value);
    }

    if (first === "g") {
        ctx.next(); // firstを消費する

        if (!ctx.read()) return PENDING;

        const second = ctx.next();

        if (second === "g") {
            // 最初の行に移動する
            return OK({
                type: NormalCmdType.MOTION,
                count,
                motion: { type: MotionType.CHAR, name: MotionName.firstLine },
            });
        }
        if (second !== "u" && second !== "U") return UNKNOWN;

        if (!ctx.read()) return PENDING;
        // {count}gu{count}{motion}: motionの範囲を小文字に変換する, gugu / guuなら現在行を小文字にする
        // {count}gU{count}{motion}: motionの範囲を大文字に変換する, gUgU / gUUなら現在行を大文字にする

        const type = (second === "u") ? NormalCmdType.TO_LOWER : NormalCmdType.TO_UPPER;

        const innerCountStr = ctx.eatDigits();
        if (innerCountStr === "0") return OK({ type, count, innerCount: null, motion: ZERO_MOTION });
        const innerCount = toCount(innerCountStr);

        if (!ctx.read()) return PENDING;

        // 以降はmotionだけが変化する
        const cmd = (motion: MotionContext) => OK({ type, count, innerCount, motion });

        const third = ctx.read();

        if (second === third || third === "_") {
            // guu / gUU / gu_ / gU_ の状態
            return cmd({ type: MotionType.LINEWISE });
        }

        if (third === "g") {
            ctx.next();
            // gug / gUg の状態
            const fourth = ctx.read();
            if (!fourth) return PENDING;

            if (second === fourth) {
                // gugu / gUgU の状態
                return cmd({ type: MotionType.LINEWISE });
            }

            if (fourth === "g") {
                // gugg / gUgg の状態
                return cmd({ type: MotionType.CHAR, name: MotionName.firstLine });

            }
            return UNKNOWN;
        }

        const result = parseMotion();
        if (result.status !== ParseStatus.OK) {
            return { status: result.status };
        }
        return cmd(result.value);
    }

    // 以上の処理のどれにも当てはまらないときは移動入力として解析する
    const result = parseMotion();
    if (result.status !== ParseStatus.OK) {
        return { status: result.status };
    }
    return OK({ type: NormalCmdType.MOTION, count, motion: result.value });
}
