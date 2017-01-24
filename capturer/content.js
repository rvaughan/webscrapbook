/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {object} scrapbook
 *******************************************************************/

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.debug(message.cmd + " receive", message, sender);

  if (message.cmd === "capture-document") {
    capturerDocSaver.captureDocumentOrFile(document, message.settings, message.options, function (response) {
      sendResponse(response);
    });
    return true; // async response
  }
});

// console.debug("loading content.js", frameUrl);
