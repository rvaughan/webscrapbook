var frameKeyId = Date.now();

 // record and use the initial src, even if it is changed later
var frameKeySrc = location.href;

var isMainFrame = (window === window.top);

window.addEventListener("DOMContentLoaded", function () {
  log("capturer/content.js load", isMainFrame);
  chrome.runtime.sendMessage({
    cmd: "init-content-script",
    id: frameKeyId,
    src: frameKeySrc
  }, function (response) {});
});

window.addEventListener("unload", function () {
  chrome.runtime.sendMessage({
    cmd: "uninit-content-script",
    id: frameKeyId,
    src: frameKeySrc
  }, function (response) {});
});

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    log("capturer/content.js receive", request, sender);
  }
);
