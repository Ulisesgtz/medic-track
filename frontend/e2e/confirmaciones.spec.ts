import type { Page } from '@playwright/test'
import { test, expect, designs, seedChild } from './helpers'

// specs/066 (US3): leaving a form with something typed asks with the app's own dialog — never the browser's box —, with the focus
// on «Seguir editando»; Escape keeps everything, «Descartar» leaves, and with nothing typed nothing is asked.

/** Any dialog of the browser itself fails the test. */
function noBrowserDialogs(page: Page) {
  page.on('dialog', (dialog) => {
    throw new Error(`browser dialog: ${dialog.message()}`)
  })
}

interface Form {
  name: string
  path: (childId: string) => string
  field: string | RegExp
  value: string
  leave: RegExp
  question: string
  /** Where «Descartar» lands. */
  after: RegExp
}

const forms: Form[] = [
  { name: 'suplemento', path: (c) => `/children/${c}/suplementos/nueva`, field: 'Nombre', value: 'Zinc', leave: /Cancelar/, question: '¿Descartar el suplemento?', after: /\/children\/[^/]+$/ },
  { name: 'botiquín', path: () => '/botiquin/nuevo', field: 'Nombre', value: 'Paracetamol', leave: /^← /, question: '¿Salir de todos modos?', after: /\/botiquin$/ },
  { name: 'medida de crecimiento', path: (c) => `/children/${c}/crecimiento/nueva`, field: 'Peso', value: '12.4', leave: /^← /, question: '¿Salir sin guardarla?', after: /\/crecimiento$/ },
  { name: 'datos del hijo', path: (c) => `/children/${c}/editar`, field: /^Peso \(kg\)/, value: '14', leave: /^← /, question: '¿Salir sin guardarlos?', after: /\/children\/[^/]+$/ },
]

for (const design of designs) {
  test.describe(`Confirmaciones propias — diseño ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    for (const form of forms) {
      test(`${form.name}: pregunta con el diálogo de la app y solo sale con «Descartar»`, async ({ page }) => {
        const { childId } = await seedChild(page, { withConsultation: false })
        noBrowserDialogs(page)
        await page.goto(form.path(childId))
        const field = typeof form.field === 'string' ? page.getByLabel(form.field, { exact: true }) : page.getByLabel(form.field)
        await field.fill(form.value)

        const leave = page.getByRole('link', { name: form.leave }).or(page.getByRole('button', { name: form.leave })).first()
        await leave.click()
        const question = page.getByRole('dialog', { name: form.question })
        await expect(question).toBeVisible()
        await expect(question.getByRole('button', { name: 'Seguir editando' })).toBeFocused()

        // Tab stays inside; Escape keeps the work.
        for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab')
        await expect(question.locator(':focus')).toHaveCount(1)
        await page.keyboard.press('Escape')
        await expect(question).toHaveCount(0)
        await expect(field).toHaveValue(form.value)

        await leave.click()
        await question.getByRole('button', { name: 'Descartar' }).click()
        await expect(page).toHaveURL(form.after)
      })
    }

    test('sin nada escrito sale sin preguntar', async ({ page }) => {
      const { childId } = await seedChild(page, { withConsultation: false })
      noBrowserDialogs(page)
      await page.goto(`/children/${childId}/suplementos/nueva`)
      await page.getByRole('link', { name: /Cancelar/ }).first().click()
      await expect(page).toHaveURL(/\/children\/[^/]+$/)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  })
}
