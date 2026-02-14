console.log("background loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("received:", message);
});
