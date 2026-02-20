import { appendContainer, initCanvas, initContainer } from "./dom.js";
import { initEditorConfig, initConfig } from "./config.js";
import { initEditorState } from "./state.js";
import { setupListeners } from "./setup.js";

function main() {
    const container = initContainer();
    const canvas = initCanvas(container);
    appendContainer(container);

    const state = initEditorState();
    const config = initEditorConfig();

    initConfig(canvas, config);
    setupListeners(canvas, state, config);

    console.log("Alt+v: Focus canvas");
}
main();
