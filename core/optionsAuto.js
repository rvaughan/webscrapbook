/********************************************************************
 *
 * Loads and updates options automatically
 *
 *******************************************************************/

scrapbook.loadOptions();

chrome.storage.onChanged.addListener(function (changes, areaName) {
  for (var key in changes) {
    scrapbook.options[key] = changes[key].newValue;
  }
});
