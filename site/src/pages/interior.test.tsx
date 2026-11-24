import { describe, expect, it } from 'vitest'
import { FAQ, FAQ_TOPICS, appHost, faqByTopic, faqText, topicId } from '../../content/faq.ts'
import { FEATURE_GROUPS } from '../../content/features.ts'
import { PLAN_FAQ_IDS, PLAN_TABLE_ROWS } from '../../content/plans.ts'
import { page, renderDoc } from '../test-utils.tsx'

const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
const doc = (path: string, env: Record<string, string | undefined> = {}) => renderDoc(page(path), { production: true }, env).doc

function oneH1(path: string) {
  const root = doc(path)
  expect(root.querySelectorAll('h1'), path).toHaveLength(1)
  expect(text(root.querySelector('h1')), path).toBe(page(path).h1)
  return root
}

describe('Funciones', () => {
  const root = oneH1('/funciones')

  it('cuatro grupos (H2) con sus tarjetas (H3), cada una con su ancla y su etiqueta de plan', () => {
    expect([...root.querySelectorAll('main h2')].map(text)).toEqual(['Consultas y medicamentos', 'Cada hijo', 'Toda la familia', 'Siempre contigo'])
    const cards = [...root.querySelectorAll('main article')]
    expect(cards).toHaveLength(FEATURE_GROUPS.flatMap((group) => group.features).length)
    for (const card of cards) {
      expect(card.id).not.toBe('')
      expect(text(card.querySelector('span'))).toMatch(/^(Plan gratis|Plan completo|Gráfica: Plan completo)$/)
      expect(card.querySelector('h3')).not.toBeNull()
    }
  })

  it('las anclas que enlaza el resto del sitio existen', () => {
    for (const id of ['consultas', 'recordatorios', 'vacunacion', 'crecimiento', 'familia']) expect(root.getElementById(id), id).not.toBeNull()
  })

  it('crecimiento aclara que la gráfica es del plan completo y las medidas no', () => {
    const crecimiento = root.getElementById('crecimiento')
    expect(text(crecimiento?.querySelector('span'))).toBe('Gráfica: Plan completo')
    expect(text(root.getElementById('vacunacion')?.querySelector('span'))).toBe('Plan gratis')
    expect(text(crecimiento)).toContain('Medidas de peso y talla')
  })

  it('las píldoras de grupo llevan a sus secciones y el cierre lleva a /planes', () => {
    const chips = [...root.querySelectorAll('nav[aria-label="Ir a una función"] a')]
    expect(chips.map((link) => link.getAttribute('href'))).toEqual(FEATURE_GROUPS.map((group) => `#${group.id}`))
    for (const chip of chips) expect(root.querySelector(chip.getAttribute('href') as string)).not.toBeNull()
    expect(root.querySelector('main a[href="/planes"]')).not.toBeNull()
  })
})

describe('Planes', () => {
  const root = oneH1('/planes')

  it('dos planes (H2, sin saltar el nivel del H1) con su precio y botones con borde hacia la app', () => {
    const cards = [...root.querySelectorAll('main article')]
    expect(cards.map((card) => text(card.querySelector('h2')))).toEqual(['Gratis', 'Plan completo'])
    expect(text(cards[0])).toContain('MX$0')
    expect(text(cards[1])).toContain('MX$499')
    expect(cards[1].className).toContain('border-action')
    expect(cards[0].querySelector('a')?.getAttribute('href')).toBe('https://app.pedi-track.com/signup')
    expect(cards[1].querySelector('a')?.getAttribute('href')).toBe('https://app.pedi-track.com/planes')
    expect(text(cards[1].querySelector('a'))).toBe('Elegir Plan completo')
    expect(root.querySelector('main a.bg-confirmed')).toBeNull()
  })

  it('la tabla es real, con encabezados, y «Incluido» y «No incluido» llevan texto', () => {
    const table = root.querySelector('[role="table"]')
    expect(table?.querySelectorAll('[role="columnheader"]')).toHaveLength(3)
    expect(table?.querySelectorAll('[role="row"]')).toHaveLength(1 + PLAN_TABLE_ROWS.length + 1)
    expect(text(table)).toContain('Incluido')
    expect(text(table)).toContain('No incluido')
    expect(text(table?.querySelector('[role="row"]:last-child'))).toBe('PrecioMX$0MX$499 al año')
  })

  it('repite tres preguntas del cobro, la primera abierta, y enlaza a todas', () => {
    const details = [...root.querySelectorAll('main details')]
    expect(details.map((item) => text(item.querySelector('summary')))).toEqual(PLAN_FAQ_IDS.map((id) => FAQ.find((item) => item.id === id)?.question))
    expect(details[0].hasAttribute('open')).toBe(true)
    expect(details.slice(1).every((item) => !item.hasAttribute('open'))).toBe(true)
    expect(root.querySelector('main a[href="/preguntas-frecuentes"]')).not.toBeNull()
  })

  it('el JSON-LD lleva las dos ofertas', () => {
    const scripts = [...root.querySelectorAll('script[type="application/ld+json"]')].map((script) => script.textContent ?? '')
    const software = scripts.find((json) => json.includes('SoftwareApplication')) ?? ''
    expect(software).toContain('"price":"0"')
    expect(software).toContain('"price":"499"')
    expect(software).toContain('P1Y')
  })
})

describe('Preguntas frecuentes', () => {
  const root = oneH1('/preguntas-frecuentes')

  it('quince preguntas en cinco temas, la primera abierta, con el JSON-LD FAQPage', () => {
    expect([...root.querySelectorAll('main h2')].map(text)).toEqual([...FAQ_TOPICS])
    const details = [...root.querySelectorAll('main details')]
    expect(details).toHaveLength(15)
    expect(details.filter((item) => item.hasAttribute('open'))).toHaveLength(1)
    expect(details[0].hasAttribute('open')).toBe(true)
    expect([...root.querySelectorAll('script[type="application/ld+json"]')].some((script) => script.textContent?.includes('FAQPage'))).toBe(true)
  })

  it('los temas enlazan a sus secciones', () => {
    const links = [...root.querySelectorAll('nav[aria-label="Temas"] a')]
    expect(links.map(text)).toEqual([...FAQ_TOPICS])
    for (const link of links) expect(root.querySelector(link.getAttribute('href') as string), text(link)).not.toBeNull()
    expect(root.getElementById('instalacion-y-uso')).not.toBeNull()
  })

  it('las instrucciones de instalación nombran la dirección de la app, no la del sitio', () => {
    const answers = text(root.getElementById('instalar-iphone')) + text(root.getElementById('instalar-android'))
    expect(answers).toContain('app.pedi-track.com')
    expect(answers).not.toContain('{app}')
    expect(answers).not.toMatch(/(?<!app\.)pedi-track\.com/)
    const preview = doc('/preguntas-frecuentes', { SITE_APP_ORIGIN: 'https://dev.pedi-track.com' })
    expect(text(preview.getElementById('instalar-iphone'))).toContain('Abre dev.pedi-track.com en Safari')
  })

  it('descargar los datos y eliminar la cuenta nombran «Mi cuenta»', () => {
    for (const id of ['descargar-datos', 'eliminar-cuenta']) expect(text(root.getElementById(id)), id).toContain('«Mi cuenta»')
    expect(text(root.getElementById('descargar-datos'))).toContain('«Descargar mis datos»')
    expect(text(root.getElementById('eliminar-cuenta'))).toContain('«Eliminar mi cuenta»')
  })

  it('los ayudantes de contenido', () => {
    expect(appHost('https://app.pedi-track.com')).toBe('app.pedi-track.com')
    expect(appHost('app.pedi-track.com')).toBe('app.pedi-track.com')
    expect(appHost('https://')).toBe('')
    expect(faqText('Abre {app} y {app}.', 'x.com')).toBe('Abre x.com y x.com.')
    expect(topicId('Instalación y uso')).toBe('instalacion-y-uso')
    expect(faqByTopic().map((group) => group.items.length)).toEqual([3, 4, 3, 2, 3])
    expect(faqByTopic([])).toEqual([])
  })
})

describe('Instalar', () => {
  const root = oneH1('/instalar')

  it('iPhone y Android, cuatro pasos cada uno en una lista ordenada', () => {
    expect([...root.querySelectorAll('main h2')].map(text)).toEqual(['iPhone (Safari)', 'Android (Chrome)'])
    const lists = [...root.querySelectorAll('main ol')]
    expect(lists).toHaveLength(2)
    for (const list of lists) expect(list.querySelectorAll(':scope > li')).toHaveLength(4)
  })

  it('las palabras de iPhone son las de la app y la dirección es la de la app', () => {
    const iphone = text(root.querySelectorAll('main ol')[0])
    expect(iphone).toContain('Abre el sitio')
    expect(iphone).toContain('Entra a app.pedi-track.com desde Safari.')
    expect(iphone).toContain('Toca Compartir')
    expect(iphone).toContain('«Agregar a pantalla de inicio»')
    expect(text(root.querySelectorAll('main ol')[1])).toContain('Entra a app.pedi-track.com desde Chrome.')
  })

  it('cada dibujo tiene su descripción y el elemento a tocar va con borde', () => {
    const arts = [...root.querySelectorAll('main [role="img"]')]
    expect(arts).toHaveLength(8)
    for (const art of arts) expect(art.getAttribute('aria-label')).toMatch(/^Ilustración del paso: /)
    expect(root.querySelectorAll('main .outline-action').length).toBeGreaterThanOrEqual(8)
  })

  it('enlaza a las preguntas sobre la instalación', () => {
    expect(root.querySelector('main a[href="/preguntas-frecuentes#instalacion-y-uso"]')).not.toBeNull()
  })
})

describe('404', () => {
  it('dice «No encontramos esta página», con sus destinos y sin Blog si no hay artículos', () => {
    const root = renderDoc(page('/404'), { production: true }).doc
    expect(root.querySelectorAll('h1')).toHaveLength(1)
    expect(text(root.querySelector('h1'))).toBe('No encontramos esta página')
    expect([...root.querySelectorAll('main nav a')].map(text)).toEqual(['Inicio', 'Funciones', 'Planes', 'Preguntas frecuentes'])
    expect(text([...root.querySelectorAll('main a')].at(-1))).toBe('Ir al inicio')
    expect(root.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
    expect(root.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it('con artículos listos suma «Blog y guías»', () => {
    const root = renderDoc(page('/404'), { production: true, hasBlog: true }).doc
    expect([...root.querySelectorAll('main nav a')].map(text)).toContain('Blog y guías')
  })
})

describe('Documentos legales', () => {
  for (const path of ['/privacidad', '/aviso-de-privacidad', '/terminos']) {
    describe(path, () => {
      const root = oneH1(path)

      it('migas, fecha, secciones con ancla e índice «Contenido» que las enlaza', () => {
        expect(root.querySelector('nav[aria-label="Migas de pan"] [aria-current="page"]')).not.toBeNull()
        expect(text(root.querySelector('main article'))).toContain('Última actualización:')
        const sections = [...root.querySelectorAll('main article section')]
        expect(sections.length).toBeGreaterThan(4)
        const links = [...root.querySelectorAll('nav[aria-label="Contenido"] a')]
        expect(links).toHaveLength(sections.length)
        for (const link of links) expect(root.getElementById((link.getAttribute('href') as string).slice(1)), text(link)).not.toBeNull()
      })

      it('la nota de borrador solo sale fuera de producción', () => {
        expect(root.querySelector('[role="note"]')).toBeNull()
        const preview = renderDoc(page(path), { production: false }).doc
        expect(text(preview.querySelector('[role="note"]'))).toContain('Borrador para revisión legal')
      })
    })
  }

  it('privacidad dice dónde se descarga y se elimina, y la analítica sin cookies', () => {
    const all = text(doc('/privacidad').querySelector('main'))
    expect(all).toContain('«Mi cuenta» descargas todos tus datos')
    expect(all).toContain('estadísticas de visitas agregadas que calcula Cloudflare en su servidor, sin cookies ni identificarte')
    expect(text(doc('/aviso-de-privacidad').querySelector('main'))).toContain('estadísticas de visitas agregadas que calcula Cloudflare en su servidor, sin cookies ni identificarte')
    expect(text(doc('/aviso-de-privacidad').querySelector('main'))).toContain('app.pedi-track.com')
  })

  it('los enlaces internos de los documentos son rutas del sitio, no archivos', () => {
    const hrefs = ['/privacidad', '/terminos'].flatMap((path) => [...doc(path).querySelectorAll('main article a')].map((link) => link.getAttribute('href') ?? ''))
    expect(hrefs).toContain('/aviso-de-privacidad')
    expect(hrefs.filter((href) => href.endsWith('.md'))).toEqual([])
  })
})
