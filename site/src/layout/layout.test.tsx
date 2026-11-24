import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { SiteContext, loadSettings, type SiteContextValue } from '../site.ts'
import { Breadcrumbs } from './Breadcrumbs.tsx'
import { FOOTER_NOTICE, Footer } from './Footer.tsx'
import { Header } from './Header.tsx'
import { Layout } from './Layout.tsx'
import { MobileMenu } from './MobileMenu.tsx'
import { NAV_ITEMS } from './nav.ts'

function withSite(children: ReactNode, overrides: Partial<SiteContextValue> = {}) {
  const value: SiteContextValue = { settings: loadSettings({}), production: false, hasBlog: false, origin: 'https://pedi-track.com', ...overrides }
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

describe('Header', () => {
  it('lleva el logo, el menú completo y «Iniciar sesión» hacia la app', () => {
    render(withSite(<Header currentPath="/" />))
    const nav = screen.getByRole('navigation', { name: 'Principal', hidden: true })
    expect(within(nav).getAllByRole('link', { hidden: true }).map((link) => link.textContent)).toEqual(NAV_ITEMS.map((item) => item.label))
    const logins = screen.getAllByRole('link', { name: 'Iniciar sesión', hidden: true })
    expect(logins.length).toBeGreaterThan(0)
    for (const login of logins) expect(login).toHaveAttribute('href', 'https://app.pedi-track.com/login')
  })

  it('marca con aria-current la página actual y solo esa', () => {
    render(withSite(<Header currentPath="/planes" />))
    const nav = screen.getByRole('navigation', { name: 'Principal', hidden: true })
    const current = within(nav).getAllByRole('link', { hidden: true }).filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current.map((link) => link.textContent)).toEqual(['Planes'])
  })

  it('el botón de menú es un enlace a #menu que controla el panel', () => {
    render(withSite(<Header currentPath="/" />))
    const toggle = screen.getByRole('link', { name: 'Abrir menú', hidden: true })
    expect(toggle).toHaveAttribute('href', '#menu')
    expect(toggle).toHaveAttribute('aria-controls', 'menu')
    expect(document.getElementById('menu')).not.toBeNull()
  })

  it('la dirección de la app sale de los ajustes', () => {
    const settings = loadSettings({ SITE_APP_ORIGIN: 'https://dev.pedi-track.com/' })
    render(withSite(<Header currentPath="/" />, { settings }))
    expect(screen.getAllByRole('link', { name: 'Iniciar sesión', hidden: true })[0]).toHaveAttribute('href', 'https://dev.pedi-track.com/login')
  })
})

describe('MobileMenu', () => {
  it('tiene id="menu", los cinco enlaces y el inicio de sesión', () => {
    render(withSite(<MobileMenu currentPath="/privacidad" />))
    const menu = document.getElementById('menu') as HTMLElement
    expect(menu.tagName).toBe('NAV')
    const links = within(menu).getAllByRole('link', { hidden: true })
    expect(links).toHaveLength(NAV_ITEMS.length + 1)
    expect(links.at(-1)).toHaveTextContent('Iniciar sesión')
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page').map((link) => link.textContent)).toEqual(['Privacidad›'])
  })
})

describe('Footer', () => {
  it('lleva los enlaces de producto y legales y el aviso fijo', () => {
    render(withSite(<Footer />))
    for (const name of ['Funciones', 'Planes', 'Instalar la app', 'Preguntas frecuentes', 'Privacidad y seguridad', 'Aviso de privacidad', 'Términos y condiciones'])
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    expect(screen.getByText(FOOTER_NOTICE)).toBeInTheDocument()
    expect(FOOTER_NOTICE).toBe(
      'PediTrack es una herramienta de registro y recordatorio; no sustituye la consulta ni el criterio de tu médico.',
    )
  })

  it('sin correo ni redes no dibuja «Contacto» ni «Blog y guías»', () => {
    render(withSite(<Footer />))
    expect(screen.queryByText('Contacto')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Escríbenos' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Facebook' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Blog y guías' })).toBeNull()
  })

  it('con correo, redes y artículos listos los dibuja', () => {
    const settings = { ...loadSettings({}), contactEmail: 'hola@pedi-track.com', social: { facebook: 'https://facebook.com/peditrack', instagram: 'https://instagram.com/peditrack' } }
    render(withSite(<Footer />, { settings, hasBlog: true }))
    expect(screen.getByRole('link', { name: 'Escríbenos' })).toHaveAttribute('href', 'mailto:hola@pedi-track.com')
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute('href', 'https://facebook.com/peditrack')
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/peditrack')
    expect(screen.getByRole('link', { name: 'Blog y guías' })).toHaveAttribute('href', '/blog')
  })

  it('una sola red configurada: solo esa', () => {
    const settings = { ...loadSettings({}), social: { instagram: 'https://instagram.com/peditrack' } }
    render(withSite(<Footer />, { settings }))
    expect(screen.getByRole('link', { name: 'Instagram' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Facebook' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Escríbenos' })).toBeNull()
  })
})

describe('Breadcrumbs', () => {
  it('enlaza todas las migas menos la última, que lleva aria-current', () => {
    render(
      <Breadcrumbs
        crumbs={[
          { name: 'Inicio', path: '/' },
          { name: 'Blog y guías', path: '/blog' },
          { name: 'Una guía', path: '/blog/una-guia' },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Migas de pan' })
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/', '/blog'])
    expect(within(nav).getByText('Una guía')).toHaveAttribute('aria-current', 'page')
  })

  it('sin migas no dibuja nada', () => {
    const { container } = render(<Breadcrumbs crumbs={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Layout', () => {
  it('pone encabezado, contenido principal con id y pie, y el enlace para saltar al contenido', () => {
    render(withSite(<Layout currentPath="/">contenido</Layout>))
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido')
    expect(screen.getByRole('main')).toHaveTextContent('contenido')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido')
  })
})
