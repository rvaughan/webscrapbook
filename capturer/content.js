var frameKeyId = Date.now();

 // record and use the initial src, even if it is changed later
var frameKeySrc = location.href;

var isMainFrame = (window === window.top);

function initFrame(callback) {
  chrome.runtime.sendMessage({
    cmd: "init-content-script",
    id: frameKeyId,
    src: frameKeySrc,
    isMainFrame: isMainFrame
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
    src: frameKeySrc,
    isMainFrame: isMainFrame
  }, function (response) {
    if (callback) {
      callback();
    }
  });
}

function captureDocument(callback) {
  // getDocumentContent(document, function (result) {
    // log({ src: frameKeySrc, content: result });
  // });

  var frameContentCallback = function (src, result) {
      log("got frame content: ", { src: src, content: result });
  };
  Array.prototype.slice.call(document.querySelectorAll("frame, iframe")).forEach(function (frame) {
    var doc;
    try {
      doc = frame.contentDocument;
    } catch (ex) {
      // log(ex);
    }
    if (doc) {
      getDocumentContent(frame.contentDocument, function (result) {
        frameContentCallback(frame.src, result);
      });
    } else {
      chrome.runtime.sendMessage({
        cmd: "get-frame-content",
        src: frame.src
      }, function (response) {
log("receive from background:", response);
        frameContentCallback(response.src, response.content);
      });
    }
  });
}

function getDocumentContent(doc, callback) {
  var result = doctypeToString(doc.doctype) + doc.documentElement.outerHTML;

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
  if (message.cmd === "capture-tab") {
    if (!isMainFrame) { return; }
    captureDocument();
  } else if (message.cmd === "get-frame-content") {
    if (message.id !== frameKeyId) { return; }
    getDocumentContent(document, function (result) {
      sendResponse({ src: frameKeySrc, content: result });
    });
  }
});

initFrame();
