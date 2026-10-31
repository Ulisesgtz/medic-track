import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { test, expect, designs, seedChild, secondPerson, inviteViaApi, acceptViaApi, vaccinationViaApi } from './helpers'

// specs/050-exportar-historial-pdf: generating the history's PDF on the device and handing it over, from the history and from the
// vaccination card, in both designs. Requires the backend running locally.

/** The hosts a page talks to while it makes the PDF: only the app, its API and the sign-in provider (never a third party with data). */
function watchHosts(page: Page) {
  const hosts = new Set<string>()
  page.on('request', (request) => hosts.add(new URL(request.url()).hostname))
  return hosts
}
const allowedHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host.includes('clerk')

/** Taps «Generar PDF», waits for «Tu PDF está listo», downloads it and returns its bytes and name. */
async function generateAndDownload(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Exportar a PDF' })
  await dialog.getByRole('button', { name: 'Generar PDF' }).click()
  await expect(dialog.getByText('Tu PDF está listo')).toBeVisible({ timeout: 60_000 })
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Descargar' }).click()
  const file = await download
  const bytes = await readFile((await file.path())!)
  return { bytes, name: file.suggestedFilename(), dialog }
}

const pageCount = (bytes: Buffer) => (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length

for (const design of designs) {
  test.describe(`Exportar a PDF — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('desde el Historial se genera y se descarga un PDF con páginas, sin hablar con terceros', async ({ page }) => {
      const { childId, token } = await seedChild(page)
      await vaccinationViaApi(page.context().request, token, childId)
      await page.goto(`/children/${childId}/historial`)
      await page.getByRole('button', { name: 'Exportar a PDF' }).click()

      const dialog = page.getByRole('dialog', { name: 'Exportar a PDF' })
      await expect(dialog.getByText('Historial de Mateo Morales')).toBeVisible()
      await expect(dialog.getByRole('switch', { name: 'Consultas' })).toHaveAttribute('aria-checked', 'true')
      await expect(dialog.getByRole('switch', { name: 'Cartilla de vacunación' })).toHaveAttribute('aria-checked', 'true')
      await expect(dialog.getByText('Este PDF contiene datos de salud de Mateo. Compártelo solo con quien lo necesite.')).toBeVisible()

      const hosts = watchHosts(page)
      const { bytes, name } = await generateAndDownload(page)
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
      expect(pageCount(bytes)).toBeGreaterThanOrEqual(3) // cover, consultations and card
      expect(name).toMatch(/^Mateo-Morales-historial-\d{1,2}-[a-z]{3}-\d{4}\.pdf$/)
      expect([...hosts].filter((host) => !allowedHost(host))).toEqual([])
    })

    test('desde la Cartilla el panel abre solo con la cartilla; un rango sin consultas dice que no hay registros', async ({ page }) => {
      const { childId, token } = await seedChild(page)
      await vaccinationViaApi(page.context().request, token, childId)
      await page.goto(`/children/${childId}/cartilla`)
      await page.getByRole('button', { name: 'Exportar a PDF' }).click()

      const dialog = page.getByRole('dialog', { name: 'Exportar a PDF' })
      await expect(dialog.getByRole('switch', { name: 'Consultas' })).toHaveAttribute('aria-checked', 'false')
      await expect(dialog.getByRole('switch', { name: 'Cartilla de vacunación' })).toHaveAttribute('aria-checked', 'true')
      const { bytes } = await generateAndDownload(page)
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')

      // The card is never filtered by the period: with only the consultations, a range without any has nothing.
      await dialog.getByRole('button', { name: 'Cerrar' }).first().click()
      await page.getByRole('button', { name: 'Exportar a PDF' }).click()
      await dialog.getByRole('switch', { name: 'Consultas' }).click()
      await dialog.getByRole('switch', { name: 'Cartilla de vacunación' }).click()
      await dialog.getByRole('radio', { name: 'Un rango de fechas' }).click()
      await dialog.getByLabel('Desde').fill('2020-01-01')
      await dialog.getByLabel('Hasta').fill('2020-01-31')
      await dialog.getByRole('button', { name: 'Generar PDF' }).click()
      await expect(dialog.getByText('No hay registros en este periodo')).toBeVisible()
      await expect(dialog.getByText('Del 1 ene al 31 ene 2020 no hay consultas ni vacunas registradas de Mateo.', { exact: false })).toBeVisible()
      await dialog.getByRole('button', { name: 'Cambiar periodo' }).click()
      await expect(dialog.getByLabel('Desde')).toHaveValue('2020-01-01')
    })

    test('el plan gratuito ve la marca «Plan completo» y el aviso del plan', async ({ page }) => {
      const { childId } = await seedChild(page, { plan: 'free', withConsultation: false })
      await page.goto(`/children/${childId}/cartilla`)
      const entry = page.getByRole('button', { name: /^Exportar a PDF/ })
      await expect(entry).toContainText('Plan completo')
      await entry.click()
      const dialog = page.getByRole('dialog', { name: 'Exportar a PDF' })
      await expect(dialog.getByText('Exportar a PDF es parte del plan completo')).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Generar PDF' })).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Ahora no' }).click()
      await expect(dialog).toHaveCount(0)
    })

    test('un Cuidador de una familia de pago puede exportar', async ({ page, browser }) => {
      const owner = await seedChild(page)
      const request = page.context().request
      await vaccinationViaApi(request, owner.token, owner.childId)
      const guest = await secondPerson(browser, design)
      await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(request, owner.token, guest.email, 'caregiver'))

      await guest.page.goto(`/children/${owner.childId}/cartilla`)
      await expect(guest.page.getByRole('button', { name: '+ Agregar vacuna' })).toHaveCount(0)
      await guest.page.getByRole('button', { name: 'Exportar a PDF' }).click()
      const { bytes } = await generateAndDownload(guest.page)
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
      await guest.context.close()
    })
  })
}
