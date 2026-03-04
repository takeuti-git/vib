export function writeClipboard(text: string): void {
    navigator.clipboard.writeText(text);
}

export async function readClipboard(): Promise<string | null> {
    try {
        return navigator.clipboard.readText();
    } catch (e) {
        console.error("clipboard read failed:", e);
        return null;
    }
}
