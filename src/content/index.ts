import { appendContainer, createCanvas, createContainer, createInput } from "./dom.js";
import { initEditorConfig, initConfig } from "./config.js";
import { initEditorState } from "./state.js";
import { setupListeners } from "./setup.js";
import { render } from "./render.js";

function main() {
    const container = createContainer();
    const canvas = createCanvas(container);
    const input = createInput(container);
    appendContainer(container);

    const state = initEditorState();
    const config = initEditorConfig();

    initConfig(canvas, config);
    setupListeners(container, canvas, input, state, config);
    render(canvas, state, config);

    console.log("Alt+v: Focus canvas");
}
main();
