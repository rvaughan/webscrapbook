/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {object} scrapbook
 *******************************************************************/

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

function capture(settings, options, callback) {
  switch (settings.captureType) {
    case "tab":
    default:
      captureDocument(document, settings, options, callback);
      break;
  }
}

function captureDocument(doc, settings, options, callback) {
  var remainingTasks = 0;

  var checkDone = function () {
    if (remainingTasks <= 0) {
      done();
    }
  };

  var done = function () {
    var result = {
      timeId: settings.timeId,
      src: frameKeySrc,
      filename: scrapbook.urlToFilename(doc.location.href),
      content: scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML,
    };

    var subdir = scrapbook.dateToId(new Date(settings.timeId));
    chrome.runtime.sendMessage({
      cmd: "download-data",
      timeId: settings.timeId,
      src: frameKeySrc,
      id: frameKeyId,
      options: {
        url: scrapbook.stringToDataUri(result.content, "text/html"),
        filename: subdir + "/" + result.filename,
        conflictAction: "uniquify",
      }
    }, function (response) {
      if (callback) {
        callback(result);
      }
    });
  };

  Array.prototype.slice.call(doc.querySelectorAll("frame, iframe")).forEach(function (frame) {

    var captureFrameCallback = function (result) {
      scrapbook.log("capture frame", result);
      remainingTasks--;
      checkDone();
    };

    var doc;
    try {
      doc = frame.contentDocument;
    } catch (ex) {
      // scrapbook.debug(ex);
    }
    if (doc) {
      remainingTasks++;
      captureDocument(frame.contentDocument, settings, options, function (result) {
        captureFrameCallback(result);
      });
    } else {
      remainingTasks++;
      chrome.runtime.sendMessage({
        cmd: "get-frame-content",
        settings: settings,
        options: options,
        src: frame.src
      }, function (response) {
        if (!response.isError) {
          captureFrameCallback(response);
        } else {
          var result = { timeId: settings.timeId, src: frameKeySrc, filename: "data:,", content: "" };
          captureFrameCallback(result);
        }
      });
    }
  });

  checkDone();
}

window.addEventListener("unload", function (event) {
  // scrapbook.debug("capturer/content.js unload", isMainFrame);
  uninitFrame();
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // scrapbook.debug("capturer/content.js onMessage", message, sender);
  if (message.cmd === "capture-tab") {
    if (!isMainFrame) { return; }
    capture(message.settings, message.options, function (settings, options) {
      scrapbook.log("capture-tab done", settings, options);
    });
  } else if (message.cmd === "get-frame-content-cs") {
    if (message.id !== frameKeyId) { return; }
    captureDocument(document, message.settings, message.options, function (response) {
      sendResponse(response);
    });
    return true; // mark this as having an async response and keep the channel open
  }
});

scrapbook.loadOptions(function () {
  initFrame();
});
