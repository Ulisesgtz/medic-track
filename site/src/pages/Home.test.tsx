import { describe, expect, it } from 'vitest'
import { FAQ, faqText, homeFaq } from '../../content/faq.ts'
import { page, renderDoc } from '../test-utils.tsx'

const home = () => renderDoc(page('/'), { production: true }).doc

const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('Home', () => {
  it('hay un solo H1, el de la tabla de SEO', () => {
    const doc = home()
    const h1 = doc.querySelectorAll('h1')
    expect(h1).toHaveLength(1)
    expect(text(h1[0])).toBe(page('/').h1)
  })

  it('las 8 secciones van en su orden, cada una con su H2', () => {
    const doc = home()
    expect([...doc.querySelectorAll('main h2')].map(text)).toEqual([
      'Cómo funciona PediTrack: de la receta al recordatorio',
      'Todo lo que PediTrack guarda de cada consulta, vacuna y medida',
      'Un expediente médico familiar, compartido y con avisos para cada quien',
      'Planes: gratis para 1 hijo o Plan completo para toda la familia',
      'Tu bitácora es tuya: privacidad explicada en simple',
      'Preguntas frecuentes sobre PediTrack',
      'Empieza a tener las tomas y las recetas en un solo lugar',
    ])
    expect([...doc.querySelectorAll('main > section')].map((section) => section.id || section.getAttribute('aria-label') || '')).toEqual([
      '',
      'Confianza',
      'como-funciona',
      'funciones',
      'familia',
      'planes',
      'privacidad',
      'preguntas',
      '',
    ])
  })

  it('las palabras clave están en sus encabezados (tabla «Palabras clave y dónde van»)', () => {
    const doc = home()
    const headings = [...doc.querySelectorAll('h1, h2, h3')].map(text)
    expect(headings).toContain('Registra cada consulta con su receta')
    expect(text(doc.querySelector('h1'))).toContain('historial médico de tus hijos')
    expect(headings.some((heading) => /expediente médico familiar/i.test(heading))).toBe(true)
    expect(text(doc.querySelector('h1'))).toMatch(/registrar los medicamentos/)
    expect(headings).toContain('Recordatorios')
    expect(text(doc.querySelector('main'))).toContain('cartilla de vacunación')
  })

  it('los tres pasos, los cuatro grupos de funciones y los cuatro bloques de privacidad son H3', () => {
    const doc = home()
    const h3 = [...doc.querySelectorAll('h3')].map(text)
    for (const title of ['Foto de la receta', 'Horario de tomas', 'Recordatorios']) expect(h3).toContain(title)
    for (const title of [
      'Registra cada consulta con su receta',
      'Todo lo de cada hijo, en su propia ficha',
      'Entre todos, sin mensajes sueltos',
      'En el teléfono y en la computadora',
    ])
      expect(h3).toContain(title)
    for (const title of ['Gratis', 'Plan completo', 'Sin anuncios', 'Sin venta de datos', 'La receta se lee en tu teléfono', 'Tú decides']) expect(h3).toContain(title)
  })

  it('«Crear cuenta gratis» y los planes van a la app; «Iniciar sesión» al inicio de sesión', () => {
    const doc = home()
    const links = [...doc.querySelectorAll('a')]
    const byText = (label: string) => links.filter((link) => text(link) === label)
    expect(byText('Crear cuenta gratis')).toHaveLength(2)
    for (const link of byText('Crear cuenta gratis')) expect(link.getAttribute('href')).toBe('https://app.pedi-track.com/signup')
    expect(byText('Empezar gratis')[0].getAttribute('href')).toBe('https://app.pedi-track.com/signup')
    for (const link of byText('Iniciar sesión')) expect(link.getAttribute('href')).toBe('https://app.pedi-track.com/login')
  })

  it('hay un solo botón sólido por pantalla: «Crear cuenta gratis» en el hero y en el cierre', () => {
    const doc = home()
    const solid = [...doc.querySelectorAll('a')].filter((link) => link.className.includes('bg-confirmed'))
    expect(solid).toHaveLength(2)
    expect(solid.every((link) => text(link) === 'Crear cuenta gratis')).toBe(true)
  })

  it('los enlaces «Ver el detalle» van a las anclas de /funciones y a /instalar', () => {
    const doc = home()
    const hrefs = [...doc.querySelectorAll('#funciones article a')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['/funciones#consultas', '/funciones#vacunacion', '/funciones#familia', '/instalar'])
    expect(doc.querySelector('#como-funciona')).not.toBeNull()
    expect([...doc.querySelectorAll('a')].some((link) => link.getAttribute('href') === '#como-funciona')).toBe(true)
  })

  it('los planes dicen MX$0 y MX$499 al año, y llevan a /planes', () => {
    const doc = home()
    const plans = doc.querySelector('#planes')
    expect(text(plans)).toContain('MX$0')
    expect(text(plans)).toContain('MX$499')
    expect(text(plans)).toContain('al año')
    const hrefs = [...(plans?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href'))
    expect(hrefs).toContain('/planes')
  })

  it('las seis preguntas del inicio son details, la primera abierta, con un enlace a todas', () => {
    const doc = home()
    const details = [...doc.querySelectorAll('#preguntas details')]
    expect(details).toHaveLength(6)
    expect(details.map((item) => text(item.querySelector('summary')))).toEqual(homeFaq().map((item) => item.question))
    expect(details[0].hasAttribute('open')).toBe(true)
    expect(details.slice(1).every((item) => !item.hasAttribute('open'))).toBe(true)
    expect(details.map((item) => text(item.querySelector('div')))).toEqual(homeFaq().map((item) => faqText(item.answer, 'app.pedi-track.com')))
    expect([...doc.querySelectorAll('#preguntas a')].map((link) => link.getAttribute('href'))).toEqual(['/preguntas-frecuentes'])
  })

  it('el pie y la privacidad enlazan a las páginas legales', () => {
    const doc = home()
    const hrefs = [...doc.querySelectorAll('#privacidad a')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['/privacidad', '/aviso-de-privacidad', '/terminos'])
  })

  it('las capturas dibujadas son imágenes con su descripción y ninguna es una etiqueta img', () => {
    const doc = home()
    const labels = [...doc.querySelectorAll('[role="img"]')].map((element) => element.getAttribute('aria-label'))
    expect(labels.length).toBe(9)
    expect(labels.every((label) => label && label.length > 10)).toBe(true)
    expect(labels).toContain('Captura de PediTrack: nueva consulta con foto de la receta y medicamentos propuestos para revisar')
    expect(doc.querySelectorAll('img')).toHaveLength(0)
  })

  it('no carga nada de terceros: ni scripts, ni hojas, ni fuentes externas', () => {
    const doc = home()
    for (const element of doc.querySelectorAll('[src], link[rel="stylesheet"], link[rel="preload"], link[rel="icon"]')) {
      const url = element.getAttribute('src') ?? element.getAttribute('href') ?? ''
      expect(url.startsWith('http'), url).toBe(false)
    }
  })

  it('las 6 preguntas del inicio salen de las 15 del contenido', () => {
    expect(FAQ).toHaveLength(15)
    expect(homeFaq()).toHaveLength(6)
  })
})
