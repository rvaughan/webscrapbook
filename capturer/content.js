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
      captureDocumentOrFile(document, settings, options, callback);
      break;
  }
}

function captureDocumentOrFile(doc, settings, options, callback) {
  // if not HTML document, capture as file
  if (["text/html", "application/xhtml+xml"].indexOf(doc.contentType) === -1) {
    if (!scrapbook.getOptions("capture.saveInlineAsHtml")) {
      captureFile(doc.location.href, settings, options, callback);
      return;
    }
  }
  captureDocument(doc, settings, options, callback);
}

function captureDocument(doc, settings, options, callback) {

  var captureMain = function () {
    // give certain nodes an unique id for later refrence,
    // since cloned nodes may not have some information
    // e.g. cloned iframes has no content, cloned canvas has no image
    var origRefKey = "data-sb-id-" + timeId;
    var origRefNodes = Array.prototype.slice.call(doc.querySelectorAll("frame, iframe"));
    origRefNodes.forEach(function (elem, index) {
      elem.setAttribute(origRefKey, index);
    });

    // construct the node list
    var selection = doc.getSelection();
    if (selection.isCollapsed) { selection = null; }
    if (scrapbook.getOption("capture.saveSelectionOnly") && selection) {
      var selNodeTree = []; // it's not enough to preserve order of sparsely selected table cells
      for (var iRange = 0, iRangeMax = selection.rangeCount; iRange < iRangeMax; ++iRange) {
        var myRange = selection.getRangeAt(iRange);
        var curNode = myRange.commonAncestorContainer;
        if (curNode.nodeName.toUpperCase() == "HTML") {
          // in some case (e.g. view image) the selection is the html node
          // and will cause subsequent errors.
          // in this case we just process as if there's no selection
          selection = null;
          break;
        }

        if (iRange === 0) {
          rootNode = htmlNode.cloneNode(false);
          headNode = doc.querySelector("head");
          headNode = headNode ? headNode.cloneNode(true) : doc.createElement("head");
          rootNode.appendChild(headNode);
          rootNode.appendChild(doc.createTextNode("\n"));
        }

        if (curNode.nodeName == "#text") { curNode = curNode.parentNode; }

        var tmpNodeList = [];
        do {
          tmpNodeList.unshift(curNode);
          curNode = curNode.parentNode;
        } while (curNode.nodeName.toUpperCase() != "HTML");

        var parentNode = rootNode;
        var branchList = selNodeTree;
        var matchedDepth = -2;
        for(var iDepth = 0; iDepth < tmpNodeList.length; ++iDepth) {
          for (var iBranch = 0; iBranch < branchList.length; ++iBranch) {
            if (tmpNodeList[iDepth] === branchList[iBranch].origNode) {
              matchedDepth = iDepth;
              break;
            }
          }

          if (iBranch === branchList.length) {
            var clonedNode = tmpNodeList[iDepth].cloneNode(false);
            parentNode.appendChild(clonedNode);
            branchList.push({
              origNode: tmpNodeList[iDepth],
              clonedNode: clonedNode,
              children: []
            });
          }
          parentNode = branchList[iBranch].clonedNode;
          branchList = branchList[iBranch].children;
        }
        if (matchedDepth === tmpNodeList.length - 1) {
          // @TODO:
          // Perhaps a similar splitter should be added for any node type
          // but some tags e.g. <td> require special care
          if (myRange.commonAncestorContainer.nodeName === "#text") {
            parentNode.appendChild(doc.createComment("DOCUMENT_FRAGMENT_SPLITTER"));
            parentNode.appendChild(doc.createTextNode(" … "));
            parentNode.appendChild(doc.createComment("/DOCUMENT_FRAGMENT_SPLITTER"));
          }
        }
        parentNode.appendChild(doc.createComment("DOCUMENT_FRAGMENT"));
        parentNode.appendChild(myRange.cloneContents());
        parentNode.appendChild(doc.createComment("/DOCUMENT_FRAGMENT"));
      }
    }
    if (!selection) {
      rootNode = htmlNode.cloneNode(true);
      headNode = rootNode.querySelector("head");
      if (!headNode) {
        headNode = doc.createElement("head");
        rootNode.insertBefore(headNode, rootNode.firstChild);
        rootNode.insertBefore(doc.createTextNode("\n"), headNode.nextSibling);
      }
    }

    // remove the temporary map key
    origRefNodes.forEach(function (elem) {
      elem.removeAttribute(origRefKey);
    });

    Array.prototype.slice.call(rootNode.querySelectorAll("frame, iframe")).forEach(function (frame) {

      var captureFrameCallback = function (result) {
        frame.src = result.filename;
        scrapbook.debug("capture frame", result);
        remainingTasks--;
        captureCheckDone();
      };

      var frameSrc = origRefNodes[frame.getAttribute(origRefKey)];
      frame.removeAttribute(origRefKey);

      var frameSettings = JSON.parse(JSON.stringify(settings));
      frameSettings.isMainFrame = false;

      var frameDoc;
      try {
        frameDoc = frameSrc.contentDocument;
      } catch (ex) {
        // scrapbook.debug(ex);
      }
      if (frameDoc) {
        remainingTasks++;
        captureDocumentOrFile(frameDoc, frameSettings, options, function (result) {
          captureFrameCallback(result);
        });
      } else {
        remainingTasks++;
        chrome.runtime.sendMessage({
          cmd: "get-frame-content",
          settings: frameSettings,
          options: options,
          src: frame.src,
        }, function (response) {
          if (!response.isError) {
            captureFrameCallback(response);
          } else {
            var result = { timeId: timeId, src: frameKeySrc, filename: "data:," };
            captureFrameCallback(result);
          }
        });
      }
    });

    captureCheckDone();
  };

  var captureCheckDone = function () {
    if (remainingTasks <= 0) {
      captureDone();
    }
  };

  var captureDone = function () {
    var content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;

    chrome.runtime.sendMessage({
      cmd: "save-document",
      src: frameKeySrc,
      id: frameKeyId,
      settings: settings,
      options: options,
      data: {
        documentName: documentName,
        mime: mime,
        content: content,
      }
    }, function (response) {
      if (callback) {
        callback(response);
      }
    });
  };

  var remainingTasks = 0;
  var timeId = settings.timeId;
  var mime = doc.contentType;
  var documentName = settings.documentName;
  var htmlNode = doc.documentElement;
  var rootNode;
  var headNode;

  chrome.runtime.sendMessage({
    cmd: "register-document",
    settings: settings,
    options: options,
  }, function (response) {
    documentName = response.documentName;
    captureMain();
  });
}

function captureFile(doc, settings, options, callback) {
}

window.addEventListener("unload", function (event) {
  // scrapbook.debug("capturer/content.js unload", isMainFrame);
  uninitFrame();
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // scrapbook.debug("capturer/content.js onMessage", message, sender);
  if (message.cmd === "capture-tab") {
    if (!isMainFrame) { return; }
    capture(message.settings, message.options, function (response) {
      sendResponse(response);
    });
    return true; // mark this as having an async response and keep the channel open
  } else if (message.cmd === "get-frame-content-cs") {
    if (message.id !== frameKeyId) { return; }
    captureDocumentOrFile(document, message.settings, message.options, function (response) {
      sendResponse(response);
    });
    return true; // mark this as having an async response and keep the channel open
  }
});

scrapbook.loadOptions(function () {
  initFrame();
});
