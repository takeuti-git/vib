import { Editor } from "./editor";
import { createCanvas, createContainer, createInput, mountElementShadow } from "./dom";
import { createEditorConfig } from "./config";
import { createEditorState } from "./state";

(function main() {
    const container = createContainer();
    const canvas = createCanvas();
    const input = createInput();
    mountElementShadow(container);
    container.append(canvas, input);

    const state = createEditorState();
    const config = createEditorConfig();
    /* const editor = */ new Editor(config, state, container, canvas, input);

    console.log("Alt+v: Focus canvas");
})();
