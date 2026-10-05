/** Loads the app again (the new version). A function of its own so tests can replace it: jsdom cannot reload. */
export function reloadApp() {
  window.location.reload()
}
