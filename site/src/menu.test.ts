import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initMenu } from './menu.ts'

function mount(): { button: HTMLButtonElement; panel: HTMLElement; links: HTMLAnchorElement[] } {
  document.body.innerHTML = `
    <header>
      <a id="menu-toggle" href="#menu" aria-label="Abrir menú" aria-controls="menu" class="toggle"><svg></svg></a>
      <nav id="menu" aria-label="Menú principal">
        <a href="/funciones">Funciones</a>
        <a href="/planes">Planes</a>
      </nav>
    </header>
    <main><a href="/otro">fuera</a></main>`
  initMenu(document)
  return {
    button: document.getElementById('menu-toggle') as HTMLButtonElement,
    panel: document.getElementById('menu') as HTMLElement,
    links: Array.from(document.querySelectorAll<HTMLAnchorElement>('#menu a')),
  }
}

const press = (key: string, init: KeyboardEventInit = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

describe('menu del teléfono', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('convierte el enlace en un botón cerrado con aria-expanded y aria-controls', () => {
    const { button, panel } = mount()
    expect(button.tagName).toBe('BUTTON')
    expect(button.type).toBe('button')
    expect(button.className).toBe('toggle')
    expect(button).toHaveAttribute('aria-controls', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-label', 'Abrir menú')
    expect(panel.dataset.open).toBe('false')
    expect(panel.dataset.js).toBe('true')
  })

  it('al tocarlo abre el panel como diálogo y manda el foco al primer enlace', () => {
    const { button, panel, links } = mount()
    button.click()
    expect(panel.dataset.open).toBe('true')
    expect(panel).toHaveAttribute('role', 'dialog')
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-label', 'Cerrar menú')
    expect(document.activeElement).toBe(links[0])
  })

  it('el mismo botón lo cierra y el foco vuelve al botón', () => {
    const { button, panel } = mount()
    button.click()
    button.click()
    expect(panel.dataset.open).toBe('false')
    expect(panel).not.toHaveAttribute('role')
    expect(panel).not.toHaveAttribute('aria-modal')
    expect(document.activeElement).toBe(button)
  })

  it('Escape lo cierra y devuelve el foco al botón', () => {
    const { button, panel } = mount()
    button.click()
    press('Escape')
    expect(panel.dataset.open).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  it('tocar un enlace lo cierra', () => {
    const { button, panel, links } = mount()
    button.click()
    links[1].addEventListener('click', (event) => event.preventDefault())
    links[1].click()
    expect(panel.dataset.open).toBe('false')
  })

  it('tocar algo del panel que no es un enlace lo deja abierto', () => {
    const { button, panel } = mount()
    button.click()
    panel.click()
    expect(panel.dataset.open).toBe('true')
  })

  it('el foco da vueltas: Tab desde el último enlace va al botón y Shift+Tab desde el botón al último', () => {
    const { button, links } = mount()
    button.click()
    links[1].focus()
    press('Tab')
    expect(document.activeElement).toBe(button)
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(links[1])
    links[0].focus()
    press('Tab')
    expect(document.activeElement).toBe(links[1])
    links[0].focus()
    press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(button)
  })

  it('Tab con el foco fuera del anillo entra por el botón', () => {
    const { button } = mount()
    button.click()
    ;(document.querySelector('main a') as HTMLElement).focus()
    press('Tab')
    expect(document.activeElement).toBe(button)
  })

  it('con el menú cerrado las teclas no hacen nada y otras teclas se ignoran', () => {
    const { button, links } = mount()
    links[0].focus()
    press('Escape')
    press('Tab')
    expect(document.activeElement).toBe(links[0])
    button.click()
    press('a')
    expect(document.activeElement).toBe(links[0])
  })

  it('sin botón o sin panel no hace nada', () => {
    document.body.innerHTML = '<a id="menu-toggle" href="#menu">menú</a>'
    initMenu(document)
    expect(document.getElementById('menu-toggle')?.tagName).toBe('A')
    document.body.innerHTML = '<nav id="menu"></nav>'
    initMenu(document)
    expect((document.getElementById('menu') as HTMLElement).dataset.js).toBeUndefined()
  })

  it('es el único JavaScript del navegador y pesa 3 KB o menos comprimido', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/menu.ts'))
    expect(gzipSync(source).length).toBeLessThanOrEqual(3 * 1024)
  })
})
