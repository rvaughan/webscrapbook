/********************************************************************
 *
 * Shared functions for most scripts, including background scripts and
 * content scripts.
 *
 *******************************************************************/

function log() {
  Function.apply.call(console.log, console, arguments);
}
