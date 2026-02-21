import { appendContainer, createCanvas, createContainer, createInput } from "./dom";
import { initEditorConfig, initConfig } from "./config";
import { initEditorState } from "./state";
import { setupListeners } from "./setup";
import { render } from "./render";

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
