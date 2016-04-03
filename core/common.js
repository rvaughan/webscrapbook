/********************************************************************
 *
 * Shared functions for most scripts, including background scripts and
 * content scripts.
 *
 * @public {object} scrapbook
 *******************************************************************/

var scrapbook = {};


/********************************************************************
 * Console
 *******************************************************************/

scrapbook.log = function () {
  Function.apply.call(console.log, console, arguments);
};


/********************************************************************
 * HTML DOM related utilities
 *******************************************************************/

scrapbook.doctypeToString = function (doctype) {
  if (!doctype) { return ""; }
  var ret = "<!DOCTYPE " + doctype.name;
  if (doctype.publicId) { ret += ' PUBLIC "' + doctype.publicId + '"'; }
  if (doctype.systemId) { ret += ' "'        + doctype.systemId + '"'; }
  ret += ">\n";
  return ret;
};
