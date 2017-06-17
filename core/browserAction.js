/********************************************************************
 *
 * Script for browserAction.html
 *
 *******************************************************************/

document.addEventListener('DOMContentLoaded', function () {
  // load languages
  scrapbook.loadLanguages(document);

  document.getElementById("captureTab").addEventListener('click', function () {
    chrome.runtime.getBackgroundPage(function (win) {
      win.capturer.captureActiveTab();
      window.close();
    });
  });

  document.getElementById("captureAllTabs").addEventListener('click', function () {
    chrome.runtime.getBackgroundPage(function (win) {
      win.capturer.captureAllTabs();
      window.close();
    });
  });
});
