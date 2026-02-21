/** 受け取った文字が全角ならtrueを返す */
export function isFullWidth(char: string): boolean {
    return /[^\x00-\x7F]/.test(char);
}
