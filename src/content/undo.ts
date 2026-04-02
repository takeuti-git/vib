import { createPatch } from "diff";

export function createDiff(oldText: string, newText: string): string {
    const patch = createPatch("filename", oldText, newText, "oldHeader", "newHeader", {
        headerOptions: {
            includeFileHeaders: false,
            includeIndex: false,
            includeUnderline: false,
        },
    });
    return patch;
}

export function toRange(text: string) {
    // "@@ -1,1 +1,1 @@" --> ["@@", "-1,1", "+1,1", "@@"]
    const splitted = text.split(" ");
    const oldRange = splitted[1]!.split(",").map((n) => Math.abs(parseInt(n, 10)));
    const newRange = splitted[2]!.split(",").map((n) => parseInt(n, 10));
    return {
        oldStart: oldRange[0]!, oldCount: oldRange[1]!,
        newStart: newRange[0]!, newCount: newRange[1]!
    };
}
