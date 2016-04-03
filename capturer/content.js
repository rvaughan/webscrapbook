var frameKeyId = Date.now();

 // record and use the initial src, even if it is changed later
var frameKeySrc = location.href;

var isMainFrame = (window === window.top);

function initFrame(callback) {
  chrome.runtime.sendMessage({
    cmd: "init-content-script",
    id: frameKeyId,
    src: frameKeySrc
  }, function (response) {
    if (callback) {
      callback();
    }
  });
}

function uninitFrame(callback) {
  chrome.runtime.sendMessage({
    cmd: "uninit-content-script",
    id: frameKeyId,
    src: frameKeySrc
  }, function (response) {
    if (callback) {
      callback();
    }
  });
}

function captureDocument(callback) {
  getDocumentContent(function (result) {
    log({ src: frameKeySrc, content: result });
  });
}

function getDocumentContent(callback) {
  var result = document.documentElement.outerHTML;

  if (callback) {
    callback(result);
  }
}

window.addEventListener("unload", function (event) {
  // log("capturer/content.js unload", isMainFrame);
  uninitFrame();
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // log("capturer/content.js onMessage", message, sender);
  if (message === "capture-tab") {
    if (!isMainFrame) { return; }
    captureDocument();
  }
});

initFrame();
