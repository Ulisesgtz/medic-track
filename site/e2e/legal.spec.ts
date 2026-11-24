import { expect, test } from '@playwright/test'
import { SIZES, expectNoAxeViolations, expectNoHorizontalOverflow, expectOneH1, open, trackOutsideRequests } from './helpers'

// Privacidad y seguridad, Aviso de privacidad y Términos a 390 y 1440 px, en Chromium y WebKit (specs/080, Historia 3).

const DOCS = [
  { path: '/privacidad', title: 'Privacidad y seguridad en PediTrack: tus datos son tuyos', h1: 'Privacidad y seguridad en PediTrack, explicadas en simple', first: 'Lo que sí hacemos' },
  { path: '/aviso-de-privacidad', title: 'Aviso de privacidad | PediTrack', h1: 'Aviso de privacidad', first: '1. Responsable' },
  { path: '/terminos', title: 'Términos y condiciones | PediTrack', h1: 'Términos y condiciones', first: '1. Quiénes somos y aceptación' },
]

for (const size of SIZES) {
  test.describe(`a ${size.width} px (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    for (const doc of DOCS) {
      test.describe(doc.path, () => {
        test('título, un H1, la fecha, las secciones y la nota de borrador de la vista previa', async ({ page }) => {
          await open(page, doc.path)
          await expect(page).toHaveTitle(doc.title)
          await expectOneH1(page, doc.h1)
          await expect(page.getByText('Última actualización:')).toBeVisible()
          await expect(page.getByRole('heading', { level: 2, name: doc.first })).toBeVisible()
          await expect(page.getByRole('note')).toContainText('Borrador para revisión legal')
          await expect(page.getByRole('navigation', { name: 'Migas de pan' }).locator('[aria-current="page"]')).toBeVisible()
        })

        test('axe, sin desbordes y sin terceros', async ({ page }) => {
          const outside = trackOutsideRequests(page)
          await open(page, doc.path)
          await expectNoAxeViolations(page)
          await expectNoHorizontalOverflow(page)
          expect(outside).toEqual([])
        })
      })
    }

    test('el pie lleva a cada documento', async ({ page }) => {
      await open(page, '/')
      const footer = page.locator('footer')
      await footer.getByRole('link', { name: 'Privacidad y seguridad' }).click()
      await expect(page).toHaveURL(/\/privacidad$/)
      await page.locator('footer').getByRole('link', { name: 'Aviso de privacidad' }).click()
      await expect(page).toHaveURL(/\/aviso-de-privacidad$/)
      await page.locator('footer').getByRole('link', { name: 'Términos y condiciones' }).click()
      await expect(page).toHaveURL(/\/terminos$/)
    })

    test('el menú lleva a Privacidad', async ({ page }) => {
      await open(page, '/funciones')
      if (size.width < 1200) {
        await page.locator('#menu-toggle').click()
        await page.locator('#menu').getByRole('link', { name: 'Privacidad' }).click()
      } else {
        await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Privacidad' }).click()
      }
      await expect(page).toHaveURL(/\/privacidad$/)
    })

    test('privacidad enlaza al aviso de privacidad desde su texto', async ({ page }) => {
      await open(page, '/privacidad')
      await page.locator('main article').getByRole('link', { name: 'Aviso de privacidad' }).click()
      await expect(page).toHaveURL(/\/aviso-de-privacidad$/)
    })

    if (size.width === 1440) {
      test('el índice «Contenido» salta a la sección', async ({ page }) => {
        await open(page, '/aviso-de-privacidad')
        const index = page.getByRole('navigation', { name: 'Contenido' })
        await expect(index).toBeVisible()
        await index.getByRole('link', { name: '7. Conservación y eliminación' }).click()
        await expect(page).toHaveURL(/#seccion-7-conservacion-y-eliminacion$/)
        await expect(page.locator('[id="seccion-7-conservacion-y-eliminacion"]')).toBeInViewport()
      })
    } else {
      test('en el teléfono no hay índice «Contenido»', async ({ page }) => {
        await open(page, '/aviso-de-privacidad')
        await expect(page.getByRole('navigation', { name: 'Contenido' })).toBeHidden()
      })
    }
  })
}
