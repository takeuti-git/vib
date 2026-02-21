export function createContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.bottom = "50px";
    container.style.right = "50px";
    container.style.zIndex = "9999";
    container.style.border = "1px solid black";
    return container;
}

export function createCanvas(container: HTMLElement): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.tabIndex = -1;
    canvas.style.position = "relative";
    canvas.style.zIndex = "1";
    canvas.style.backgroundColor = "white";
    canvas.style.outline = "none";
    container.appendChild(canvas);
    return canvas;
}

export function createInput(container: HTMLElement): HTMLInputElement {
    const input = document.createElement("input");
    input.style.position = "absolute";
    input.style.top = "0";
    input.style.left = "0";
    input.style.zIndex = "-1";
    input.style.width = "fit-content";
    input.style.padding = "2px";
    input.style.margin = "0";
    input.style.outline = "none";
    input.style.border = "4px ridge";
    container.appendChild(input);
    return input;
}

export function appendContainer(container: HTMLElement): void {
    document.body.appendChild(container);
}

export function showContainer(container: HTMLElement) {
    container.style.visibility = "visible";
    container.style.display = "block";
}

export function hideContainer(container: HTMLElement) {
    container.style.visibility = "hidden";
    container.style.display = "none";
}
