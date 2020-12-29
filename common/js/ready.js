/**
 * Util helper function for common use in internal pages.
 */
function onDocumentReady (fn) {
  if (document.readyState !== 'loading') {
    fn()
  } else {
    document.addEventListener('DOMContentLoaded', fn)
  }
}
