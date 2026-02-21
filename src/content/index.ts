import { Editor } from "./editor";
import { appendContainer, createCanvas, createContainer, createInput } from "./dom";
import { createEditorConfig } from "./config";
import { createEditorState } from "./state";

(function main() {
    const container = createContainer();
    const canvas = createCanvas(container);
    const input = createInput(container);
    appendContainer(container);

    const state = createEditorState();
    const config = createEditorConfig();
    /* const editor = */ new Editor(config, state, container, canvas, input);

    console.log("Alt+v: Focus canvas");
})();
