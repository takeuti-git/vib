document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn");
    btn?.addEventListener("click", () => {
        chrome.runtime.sendMessage({type: "hello"});
    });
});
