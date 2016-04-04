var frameKeyId = Date.now().toString();

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
    // scrapbook.debug({ src: frameKeySrc, content: result });
  // });

  var timeId = Date.now();

  var frameContentCallback = function (result) {
      scrapbook.debug("got frame content: ", result);
  };

  Array.prototype.slice.call(document.querySelectorAll("frame, iframe")).forEach(function (frame) {
    var doc;
    try {
      doc = frame.contentDocument;
    } catch (ex) {
      // scrapbook.debug(ex);
    }
    if (doc) {
      getDocumentContent(frame.contentDocument, function (result) {
        frameContentCallback({ timeId: timeId, src: frame.src, content: result });
      });
    } else {
      chrome.runtime.sendMessage({
        cmd: "get-frame-content",
        timeId: timeId,
        src: frame.src
      }, function (response) {
        frameContentCallback({ timeId: response.timeId, src: response.src, content: response.content });
      });
    }
  });
}

function getDocumentContent(doc, callback) {
  var result = scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML;

  if (callback) {
    callback(result);
  }
}

window.addEventListener("unload", function (event) {
  // scrapbook.debug("capturer/content.js unload", isMainFrame);
  uninitFrame();
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // scrapbook.debug("capturer/content.js onMessage", message, sender);
  if (message.cmd === "capture-tab") {
    if (!isMainFrame) { return; }
    captureDocument();
  } else if (message.cmd === "get-frame-content-cs") {
    if (message.id !== frameKeyId) { return; }
    getDocumentContent(document, function (result) {
      sendResponse({ timeId: message.timeId, src: frameKeySrc, content: result });
    });
    return true; // mark this as having an async response and keep the channel open
  }
});

initFrame();
