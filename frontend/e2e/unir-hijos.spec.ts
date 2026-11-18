import type { Browser } from '@playwright/test'
import {
  PNG_BASE64,
  acceptViaApi,
  allowClerkOn,
  apiPost,
  designs,
  expect,
  inviteViaApi,
  invitationUrl,
  secondPerson,
  seedChild,
  test,
} from './helpers'

// specs/074-unir-hijo-duplicado: a person who already had children of their own accepts a family's invitation and chooses what to
// do with them — join one with the family's, use only the family's (hide) or keep both. Two real people, each in their own
// browser, at 390 and 1280 px. The setup goes through the API; the flow itself is the real screens.

/** The invited person, with a child of their own and one consultation on it. */
async function guestWithOwnChild(browser: Browser, design: (typeof designs)[number], childName: string) {
  const guest = await secondPerson(browser, design, { firstName: 'Laura' })
  const account = await apiPost(guest.context.request, guest.token, `/accounts/${guest.accountId}/children`, {
    firstName: childName,
    lastName: 'Morales',
    birthDate: '2021-03-15',
  })
  const child = account.children.find((c: { firstName: string }) => c.firstName === childName)
  const today = new Date()
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await apiPost(guest.context.request, guest.token, `/children/${child.id}/consultations`, {
    doctorName: 'Dr. Propio',
    consultDate: day,
    photoBase64: PNG_BASE64,
    notes: 'Anotada por Laura',
    utcOffsetMinutes: -today.getTimezoneOffset() || 0,
    medications: [{ name: 'Paracetamol', frequencyHours: 8, durationDays: 1, startTime: '00:00' }],
  })
  return { ...guest, ownChildId: child.id as string }
}

for (const design of designs) {
  test.describe(`Unir hijos duplicados, ${design.name}`, () => {
    test.use({ viewport: design.viewport })

    test('accepts, joins the child of one’s own with the family’s and ends with a single child and its history', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await guestWithOwnChild(browser, design, 'Mateo')
      const invitation = await inviteViaApi(page.context().request, owner.token, guest.email)

      // Accepting is its own step; then the question of what to do with the children already there.
      await guest.page.goto(invitationUrl(invitation))
      await guest.page.getByRole('button', { name: 'Aceptar' }).click()
      await expect(guest.page).toHaveURL(/\/familia\/como-seguir/)
      await expect(guest.page.getByRole('heading', { name: '¿Cómo quieres seguir?' })).toBeVisible()
      await expect(guest.page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
      await guest.page.getByRole('radio', { name: /^Unir/ }).check({ force: true })
      await guest.page.getByRole('button', { name: 'Continuar' }).click()

      // The pairing: the same name is only suggested.
      await expect(guest.page.getByRole('heading', { name: 'Empareja a tus hijos' })).toBeVisible()
      await expect(guest.page.getByText('Se llaman igual')).toBeVisible()
      await guest.page.getByRole('button', { name: 'Continuar' }).click()

      // The birth dates differ: none is chosen by itself.
      await expect(guest.page.getByRole('heading', { name: 'Datos distintos' })).toBeVisible()
      await expect(guest.page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
      await guest.page.getByRole('radio', { name: /El de la familia/ }).check({ force: true })
      await guest.page.getByRole('button', { name: 'Continuar' }).click()

      // The summary says what moves and that it can't be undone, then merges.
      await expect(guest.page.getByRole('heading', { name: 'Revisa el resumen' })).toBeVisible()
      await expect(guest.page.getByText('Mateo (tuyo) → Mateo (familia)')).toBeVisible()
      await expect(guest.page.getByText(/Esto no se puede deshacer/)).toBeVisible()
      await guest.page.getByRole('button', { name: 'Unir', exact: true }).click()
      await expect(guest.page.getByRole('heading', { name: 'Se unió Mateo' })).toBeVisible()
      await guest.page.getByRole('link', { name: 'Ir al inicio' }).click()

      // One Mateo, with both people's consultations and the line of who joined it.
      await expect(guest.page).toHaveURL(/\/home/)
      await expect(guest.page.getByRole('main').getByRole('link', { name: 'Ver detalle de Mateo' })).toHaveCount(1)
      await guest.page.goto(`/children/${owner.childId}`)
      await expect(guest.page.getByText('Dra. Laura Cázares')).toBeVisible()
      await expect(guest.page.getByText('Dr. Propio')).toBeVisible()
      await expect(guest.page.getByText(/Se unió el .* con el registro de Laura/)).toBeVisible()
      await guest.context.close()
    })

    test('«Usar solo lo de la familia» hides the own child and «Mi cuenta» shows it again', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await guestWithOwnChild(browser, design, 'Sofía')
      const invitation = await inviteViaApi(page.context().request, owner.token, guest.email)

      await guest.page.goto(invitationUrl(invitation))
      await guest.page.getByRole('button', { name: 'Aceptar' }).click()
      await guest.page.getByRole('radio', { name: /Usar solo lo de la familia/ }).check({ force: true })
      await guest.page.getByRole('button', { name: 'Continuar' }).click()

      // Only the family's child is on the home; the own one is hidden, not deleted.
      await expect(guest.page).toHaveURL(/\/home/)
      const main = guest.page.getByRole('main')
      await expect(main.getByRole('link', { name: 'Ver detalle de Mateo' })).toBeVisible()
      await expect(main.getByRole('link', { name: 'Ver detalle de Sofía' })).toHaveCount(0)

      await guest.page.goto('/cuenta')
      await expect(guest.page.getByRole('heading', { name: 'Hijos ocultos' })).toBeVisible()
      await guest.page.getByRole('button', { name: 'Volver a mostrar a Sofía' }).click()
      await guest.page.goto('/home')
      await expect(guest.page.getByRole('main').getByRole('link', { name: 'Ver detalle de Sofía' })).toBeVisible()
      await guest.context.close()
    })

    test('«Conservar ambas» says nothing changed, and «Familia» offers to join them later', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await guestWithOwnChild(browser, design, 'Sofía')
      const invitation = await inviteViaApi(page.context().request, owner.token, guest.email)

      await guest.page.goto(invitationUrl(invitation))
      await guest.page.getByRole('button', { name: 'Aceptar' }).click()
      await guest.page.getByRole('radio', { name: /Conservar ambas/ }).check({ force: true })
      await guest.page.getByRole('button', { name: 'Continuar' }).click()
      await expect(guest.page.getByRole('heading', { name: 'Quedan los dos registros' })).toBeVisible()

      await guest.page.goto('/familia')
      const main = guest.page.getByRole('main')
      await expect(main.getByRole('link', { name: 'Unir con un hijo de la familia' })).toBeVisible()
      await expect(main.getByRole('button', { name: 'Ocultar mis hijos' })).toBeVisible()
      await guest.context.close()
    })

    test('a Caregiver can hide or keep, but has no «Unir»', async ({ page, browser }) => {
      await allowClerkOn(page)
      const owner = await seedChild(page)
      const guest = await guestWithOwnChild(browser, design, 'Sofía')
      const invitation = await inviteViaApi(page.context().request, owner.token, guest.email, 'caregiver')
      await acceptViaApi(guest.context.request, guest.token, invitation)

      await guest.page.goto('/familia/como-seguir')
      await expect(guest.page.getByRole('radio', { name: /Conservar ambas/ })).toBeAttached()
      await expect(guest.page.getByRole('radio', { name: /^Unir/ })).toHaveCount(0)

      await guest.page.goto('/familia')
      const main = guest.page.getByRole('main')
      await expect(main.getByRole('button', { name: 'Ocultar mis hijos' })).toBeVisible()
      await expect(main.getByRole('link', { name: 'Unir con un hijo de la familia' })).toHaveCount(0)
      await guest.context.close()
    })
  })
}
