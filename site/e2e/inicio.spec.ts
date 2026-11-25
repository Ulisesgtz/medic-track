import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// La portada a 390 (teléfono), 768 (tableta) y 1440 (web), en Chromium y WebKit (specs/080, Historia 1).

const APP = 'https://app.pedi-track.com'
const SIZES = [
  { name: 'teléfono', width: 390, height: 844 },
  { name: 'tableta', width: 768, height: 1024 },
  { name: 'web', width: 1440, height: 900 },
]

const SECTIONS = [
  'Cómo funciona PediTrack: de la receta al recordatorio',
  'Todo lo que PediTrack guarda de cada consulta, vacuna y medida',
  'Un expediente médico familiar, compartido y con avisos para cada quien',
  'Planes: gratis para 1 hijo o Plan completo para toda la familia',
  'Tu bitácora es tuya: privacidad explicada en simple',
  'Preguntas frecuentes sobre PediTrack',
  'Empieza a tener las tomas y las recetas en un solo lugar',
]

async function open(page: Page) {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
}

for (const size of SIZES) {
  test.describe(`inicio a ${size.width} px (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('tiene el título, un solo H1 y las siete secciones con sus H2', async ({ page }) => {
      await open(page)
      await expect(page).toHaveTitle('PediTrack: app para registrar los medicamentos de tus hijos')
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('h1')).toHaveText('App para registrar los medicamentos y el historial médico de tus hijos')
      for (const title of SECTIONS) await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
      await expect(page.getByRole('heading', { level: 3, name: 'Registra cada consulta con su receta' })).toBeVisible()
      await expect(page.getByText('Bitácora médica de la familia', { exact: true }).first()).toBeVisible()
    })

    test('«Crear cuenta gratis» es el botón principal y lleva a /signup de la app', async ({ page }) => {
      await page.route(`${APP}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<title>app</title>' }))
      await open(page)
      const hero = page.getByRole('link', { name: 'Crear cuenta gratis' }).first()
      await expect(hero).toBeVisible()
      await expect(hero).toHaveAttribute('href', `${APP}/signup`)
      const box = await hero.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      if (size.width === 390) {
        // En el teléfono el botón entra en el primer pliegue y ocupa todo el ancho.
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(size.height)
        expect(box?.width ?? 0).toBeGreaterThan(size.width - 60)
      }
      await hero.click()
      await expect(page).toHaveURL(`${APP}/signup`)
    })

    test('no se sale de la pantalla a los lados', async ({ page }) => {
      await open(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })

    test('axe no encuentra violaciones (contraste incluido)', async ({ page }) => {
      await open(page)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([])
    })

    test('no pide nada fuera de localhost al cargar', async ({ page }) => {
      const outside: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) outside.push(request.url())
      })
      await open(page)
      expect(outside).toEqual([])
    })

    test('las preguntas son acordeones: la primera abierta y las demás se abren al tocarlas', async ({ page }) => {
      await open(page)
      const items = page.locator('#preguntas details')
      await expect(items).toHaveCount(6)
      await expect(items.first()).toHaveAttribute('open', '')
      const second = items.nth(1)
      await expect(second).not.toHaveAttribute('open', '')
      await second.locator('summary').click()
      await expect(second).toHaveAttribute('open', '')
      await expect(second.getByText('Hay un plan gratis (MX$0) para 1 hijo', { exact: false })).toBeVisible()
    })
  })
}

test.describe('encabezado según el ancho', () => {
  test('web: menú completo con «Iniciar sesión» y sin botón de menú', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    const nav = page.getByRole('navigation', { name: 'Principal' })
    await expect(nav.getByRole('link')).toHaveText(['Funciones', 'Planes', 'Familia', 'Privacidad', 'Preguntas'])
    await expect(page.getByRole('banner').getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', `${APP}/login`)
    await expect(page.locator('#menu-toggle')).toBeHidden()
  })

  test('tableta: «Iniciar sesión» y el botón de menú, sin menú completo', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await open(page)
    await expect(page.getByRole('banner').getByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
    await expect(page.locator('#menu-toggle')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden()
    const box = await page.locator('#menu-toggle').boundingBox()
    expect(box?.width).toBe(48)
    expect(box?.height).toBe(48)
  })

  test('teléfono: solo el botón de menú de 48 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    await expect(page.getByRole('banner').getByRole('link', { name: 'Iniciar sesión' })).toBeHidden()
    await expect(page.locator('#menu-toggle')).toBeVisible()
  })
})

test.describe('menú del teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('abre, retiene el foco, se cierra con Escape y devuelve el foco al botón', async ({ page }) => {
    await open(page)
    const toggle = page.locator('#menu-toggle')
    const menu = page.locator('#menu')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(menu).toBeHidden()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('link')).toHaveText(['Funciones›', 'Planes›', 'Familia›', 'Privacidad›', 'Preguntas›', 'Iniciar sesión'])
    await expect(menu.getByRole('link', { name: 'Funciones' })).toBeFocused()
    // El foco no sale del menú: da vueltas entre el botón y sus enlaces.
    for (let tab = 0; tab < 8; tab++) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(() => {
        const active = document.activeElement
        return active?.id === 'menu-toggle' || Boolean(active?.closest('#menu'))
      })
      expect(inside).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('el botón también lo cierra', async ({ page }) => {
    await open(page)
    await page.locator('#menu-toggle').click()
    await expect(page.locator('#menu')).toBeVisible()
    await page.locator('#menu-toggle').click()
    await expect(page.locator('#menu')).toBeHidden()
  })

  test('«Iniciar sesión» del menú lleva a la app', async ({ page }) => {
    await page.route(`${APP}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<title>app</title>' }))
    await open(page)
    await page.locator('#menu-toggle').click()
    await page.locator('#menu').getByRole('link', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(`${APP}/login`)
  })

  test('axe no encuentra violaciones con el menú abierto', async ({ page }) => {
    await open(page)
    await page.locator('#menu-toggle').click()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

test.describe('sin JavaScript', () => {
  test.use({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false })

  test('la página ya viene armada y el enlace «#menu» abre el panel', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('App para registrar los medicamentos y el historial médico de tus hijos')
    await expect(page.locator('#menu')).toBeHidden()
    await page.locator('a#menu-toggle').click()
    await expect(page.locator('#menu')).toBeVisible()
    await expect(page.locator('#menu').getByRole('link', { name: 'Planes' })).toBeVisible()
    // Las preguntas son <details>: abren sin JavaScript.
    await page.locator('#preguntas details').nth(2).locator('summary').click()
    await expect(page.locator('#preguntas details').nth(2)).toHaveAttribute('open', '')
  })
})

test('curl: el HTML trae el title, la descripción, el canonical y el único H1 sin ejecutar nada', async ({ request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('<title>PediTrack: app para registrar los medicamentos de tus hijos</title>')
  expect(html).toContain('name="description"')
  expect(html).toContain('rel="canonical" href="https://pedi-track.com/"')
  expect(html.match(/<h1[ >]/g)).toHaveLength(1)
  expect(html).toContain('Crear cuenta gratis')
  expect(html).toContain('application/ld+json')
  expect(html).toContain('noindex')
})
