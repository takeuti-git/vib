import { Editor } from "./editor";
import { createCanvas, createContainer, createInput, mountElementShadow } from "./dom";
import { createEditorConfig } from "./config";
import { createEditorState } from "./state";
import { Renderer } from "./renderer";

(function main() {
    const container = createContainer();
    const canvas = createCanvas();
    const input = createInput();
    mountElementShadow(container);
    container.append(canvas, input);

    const state = createEditorState();
    const config = createEditorConfig();
    const renderer = new Renderer(config, canvas);
    /* const editor = */new Editor(config, state, container, canvas, input, renderer);

    console.log("Alt+v: Focus canvas");
})();
