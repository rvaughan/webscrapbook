/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {object} scrapbook
 *******************************************************************/

function getFrameContent(frameElement, timeId, settings, options, callback) {
  var channel = new MessageChannel();
  frameElement.contentWindow.postMessage({
    extension: chrome.runtime.id,
    cmd: "capturer.captureDocumentOrFile",
    timeId: timeId,
    settings: settings,
    options: options
  }, "*", [channel.port2]);
  channel.port1.onmessage = function (event) {
    var message = event.data;
    if (message.extension !== chrome.runtime.id) { return; }
    if (message.timeId !== timeId) { return; }
    console.debug("channel receive", event);
    
    if (message.cmd === "capturer.captureDocumentOrFile.start") {
    } else if (message.cmd === "capturer.captureDocumentOrFile.complete") {
      callback(message.response);
      delete channel;
    }
  };
}

window.addEventListener("message", function (event) {
  var message = event.data;
  if (message.extension !== chrome.runtime.id) { return; }
  console.debug("content window receive", event);

  if (message.cmd === "capturer.captureDocumentOrFile") {
    event.ports[0].postMessage({
      extension: chrome.runtime.id,
      cmd: "capturer.captureDocumentOrFile.start",
      timeId: message.timeId
    });
    capturer.captureDocumentOrFile(document, message.settings, message.options, function (response) {
      event.ports[0].postMessage({
        extension: chrome.runtime.id,
        cmd: "capturer.captureDocumentOrFile.complete",
        timeId: message.timeId,
        response: response
      });
    });
  }
}, false);

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.debug(message.cmd + " receive", message, sender);

  if (message.cmd === "capturer.captureDocumentOrFile") {
    capturer.captureDocumentOrFile(document, message.settings, message.options, function (response) {
      sendResponse(response);
    });
    return true; // async response
  }
});

// console.debug("loading content.js", frameUrl);
