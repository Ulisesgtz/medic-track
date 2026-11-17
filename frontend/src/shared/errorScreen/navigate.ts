// specs/072: its own module so the tests can replace what really leaves the page.
export function reloadPage() {
  window.location.reload()
}

export function goTo(path: string) {
  window.location.assign(path)
}
