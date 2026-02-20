export function initContainer(): HTMLElement {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.bottom = "50px";
    container.style.right = "50px";
    container.style.zIndex = "9999";
    container.style.border = "1px solid black";

    return container;
}

export function initCanvas(container: HTMLElement): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    return canvas;
}

export function appendContainer(container: HTMLElement): void {
    document.body.appendChild(container);
}
