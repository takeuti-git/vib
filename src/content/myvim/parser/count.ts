import { isNumber } from "../utils";

export type Count = number | null;

export function toCount(numberLikeStr: string) {
    if (numberLikeStr !== "" && !isNumber(numberLikeStr))
        throw new Error(`"${numberLikeStr}" is not numeric`);
    return (numberLikeStr === "") ? null : parseInt(numberLikeStr, 10);
}
