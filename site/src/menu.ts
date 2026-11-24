// El único JavaScript del navegador (spec 080, R2). Mejora el menú del teléfono: sin él, «#menu» abre el panel con :target; con él el
// enlace pasa a ser un botón y el panel un diálogo que retiene el foco. No anima nada, así que ya respeta prefers-reduced-motion.

export function initMenu(doc: Document = document): void {
  const link = doc.getElementById('menu-toggle')
  const panel = doc.getElementById('menu')
  if (!link || !panel) return

  const button = doc.createElement('button')
  button.type = 'button'
  button.id = link.id
  button.className = link.className
  button.innerHTML = link.innerHTML
  button.setAttribute('aria-controls', 'menu')
  link.replaceWith(button)
  panel.dataset.js = 'true'

  const links = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href]'))

  const set = (open: boolean, focus?: HTMLElement) => {
    panel.dataset.open = String(open)
    button.setAttribute('aria-expanded', String(open))
    button.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú')
    if (open) {
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
    } else {
      panel.removeAttribute('role')
      panel.removeAttribute('aria-modal')
    }
    focus?.focus()
  }
  const isOpen = () => panel.dataset.open === 'true'

  set(false)
  button.addEventListener('click', () => (isOpen() ? set(false, button) : set(true, links()[0])))
  panel.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a[href]')) set(false)
  })
  doc.addEventListener('keydown', (event) => {
    if (!isOpen()) return
    if (event.key === 'Escape') {
      set(false, button)
      return
    }
    if (event.key !== 'Tab') return
    // El foco da vueltas entre el botón y los enlaces del panel.
    const ring = [button, ...links()]
    const at = ring.indexOf(doc.activeElement as HTMLElement)
    const next = event.shiftKey ? (at <= 0 ? ring.length - 1 : at - 1) : at === ring.length - 1 ? 0 : at + 1
    event.preventDefault()
    ring[next].focus()
  })
}

initMenu()
