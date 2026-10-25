import { useEffect } from 'react'

// The installed app opens at its manifest's start_url. The parents' manifest starts at /home (a Clerk login), so a child who added
// the app to the home screen from /hijo landed on the parents' login. On the child's screens the page points to a manifest of its own
// that starts at /hijo; the parents' one comes back when the child's screens are left.

export const CHILD_MANIFEST = '/manifest-hijo.webmanifest'

/** Points the page's manifest to the child's while the calling screen is mounted. */
export function useChildManifest() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return
    const previous = link.getAttribute('href')
    link.setAttribute('href', CHILD_MANIFEST)
    return () => {
      if (previous !== null) link.setAttribute('href', previous)
    }
  }, [])
}

/** The secret of a pasted link: what comes after the `#`, or the whole text if it has none. */
export function tokenFromPasted(text: string): string {
  const trimmed = text.trim()
  const hash = trimmed.lastIndexOf('#')
  return (hash >= 0 ? trimmed.slice(hash + 1) : trimmed).trim()
}
