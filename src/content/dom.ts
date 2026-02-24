export function mountElementShadow(el: HTMLElement): void {
    const shadowHost = document.getElementById("vib-shadowHost") 
        ?? document.createElement("div");
    shadowHost.id = "vib-shadowHost";
    document.body.appendChild(shadowHost);

    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    shadowRoot.appendChild(el);
}

export function createContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.id = "vib-container";
    container.style.position = "fixed";
    container.style.bottom = "50px";
    container.style.right = "50px";
    container.style.zIndex = "999";
    container.style.outline = "1px solid black";
    container.style.height = "fit-content";
    container.style.boxSizing = "content-box";
    return container;
}

export function createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.id = "vib-canvas";
    canvas.tabIndex = -1;
    canvas.style.position = "relative";
    canvas.style.zIndex = "1";
    canvas.style.display = "block";
    canvas.style.backgroundColor = "white";
    canvas.style.outline = "none";
    return canvas;
}

export function createInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.id = "vib-input";
    input.style.position = "absolute";
    input.style.top = "0";
    input.style.left = "0";
    input.style.zIndex = "-1";
    input.style.width = "fit-content";
    input.style.maxWidth = "100%";
    input.style.padding = "2px";
    input.style.margin = "0";
    input.style.outline = "none";
    input.style.border = "4px ridge";
    return input;
}

export function showContainer(container: HTMLElement) {
    container.style.visibility = "visible";
    container.style.display = "block";
}

export function hideContainer(container: HTMLElement) {
    container.style.visibility = "hidden";
    container.style.display = "none";
}
