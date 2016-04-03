/********************************************************************
 *
 * Shared functions for most scripts, including background scripts and
 * content scripts.
 *
 *******************************************************************/

function log() {
  Function.apply.call(console.log, console, arguments);
}

function doctypeToString(doctype) {
  if (!doctype) { return ""; }
  var ret = "<!DOCTYPE " + doctype.name;
  if (doctype.publicId) { ret += ' PUBLIC "' + doctype.publicId + '"'; }
  if (doctype.systemId) { ret += ' "'        + doctype.systemId + '"'; }
  ret += ">\n";
  return ret;
}
