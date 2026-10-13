import { allowClerkOn, acceptViaApi, apiPost, designs, expect, inviteViaApi, PNG_BASE64, queryDb, routineViaApi, secondPerson, seedChild, test } from './helpers'

// specs/032-compartir-con-familia, US3: a dose is reminded once to each person with access and a device — and to nobody
// when somebody already marked it. A browser can't receive a real push here (specs/011, research R12): each person's device
// is registered through the API with an endpoint of a known push service, and what is checked is who the backend CLAIMED the
// reminder for (`dose_reminders`, one row per dose and person); the delivery itself is covered by the backend's tests.
// The scheduler runs inside the API every 30 s, so these wait for it with a poll.

const API = 'http://localhost:8080'
const design = designs[0]

/** "HH:MM" and the day of an instant in the browser's own time zone, which is what the app sends the server. */
function localParts(at: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    day: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    offset: -at.getTimezoneOffset(),
  }
}

test.describe('Recordatorios por persona, familia', () => {
  test.use({ viewport: design.viewport })

  test('a dose due now is claimed once for each person with a device, and never for a dose already marked', async ({ page, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'it waits for the backend scheduler: once is enough')
    test.setTimeout(150_000)
    await allowClerkOn(page)
    const owner = await seedChild(page, { withConsultation: false })
    const guest = await secondPerson(browser, design)
    await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email))

    // Each person turns reminders on in their own device (a different endpoint each).
    for (const [request, token, accountId] of [
      [page.context().request, owner.token, owner.accountId],
      [guest.context.request, guest.token, guest.accountId!],
    ] as const) {
      const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-familia-${Math.random().toString(36).slice(2)}`
      await apiPost(request, token, `/accounts/${accountId}/reminder-devices`, { endpoint, keys: { p256dh: 'e2e-p256dh', auth: 'e2e-auth' } })
    }
    // A dose only counts for a device activated before it: move both back so the dose of five minutes ago is theirs.
    await queryDb(`UPDATE reminder_devices SET activated_at = now() - interval '3 hours' WHERE account_id = ANY($1::uuid[])`, [[owner.accountId, guest.accountId]])

    // Two consultations with a dose five and four minutes ago; somebody marks the second one at once.
    const consult = async (minutesAgo: number, name: string) => {
      const parts = localParts(new Date(Date.now() - minutesAgo * 60_000))
      return apiPost(page.context().request, owner.token, `/children/${owner.childId}/consultations`, {
        doctorName: 'Dra. Laura Cázares',
        consultDate: parts.day,
        photoBase64: PNG_BASE64,
        notes: '',
        utcOffsetMinutes: parts.offset,
        medications: [{ name, frequencyHours: 8, durationDays: 1, startTime: parts.time }],
      })
    }
    const unmarked = await consult(5, 'Amoxicilina')
    const marked = await consult(4, 'Ibuprofeno')
    const markedDose = marked.medications[0].doses.find((d: { scheduledAt: string }) => new Date(d.scheduledAt).getTime() < Date.now())
    expect(markedDose, 'the dose of four minutes ago exists').toBeTruthy()
    const mark = await guest.context.request.patch(`${API}/consultations/${marked.id}/doses/${markedDose.id}`, {
      data: { taken: true },
      headers: { Authorization: `Bearer ${guest.token}` },
    })
    expect(mark.status()).toBe(200)

    const remindedOf = (consultationId: string) =>
      queryDb<{ account_id: string }>(
        `SELECT dr.account_id FROM dose_reminders dr
         JOIN doses d ON d.id = dr.dose_id JOIN medications m ON m.id = d.medication_id
         WHERE m.consultation_id = $1 ORDER BY dr.account_id`,
        [consultationId],
      ).then((rows) => rows.map((r) => r.account_id))

    // The scheduler (every 30 s) claims one pair per person for the dose nobody marked...
    await expect.poll(async () => (await remindedOf(unmarked.id)).length, { timeout: 90_000, intervals: [2_000] }).toBe(2)
    expect((await remindedOf(unmarked.id)).sort()).toEqual([owner.accountId, guest.accountId!].sort())
    // ...and, having run after both existed, none for the one that was already marked.
    expect(await remindedOf(marked.id)).toEqual([])
    await guest.context.close()
  })
})

// specs/033-recordatorios-suplementos-citas: the same per-person rule for the supplements and the appointments. A reminder is
// claimed once for each person with access and a device — except whoever turned «Tus avisos» off for that routine or appointment.

type Person = { request: import('@playwright/test').APIRequestContext; token: string; accountId: string }

/** Registers a device for each person and moves its activation back, so what is due now counts for it. */
async function turnRemindersOn(people: Person[]) {
  for (const { request, token, accountId } of people) {
    const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-extra-${Math.random().toString(36).slice(2)}`
    await apiPost(request, token, `/accounts/${accountId}/reminder-devices`, { endpoint, keys: { p256dh: 'e2e-p256dh', auth: 'e2e-auth' } })
  }
  await queryDb(`UPDATE reminder_devices SET activated_at = now() - interval '3 hours' WHERE account_id = ANY($1::uuid[])`, [people.map((p) => p.accountId)])
}

test.describe('Recordatorios por persona, suplementos y citas', () => {
  test.use({ viewport: design.viewport })

  test('a supplement dose is claimed for each person with a device, and not for who turned «Tus avisos» off', async ({ page, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'it waits for the backend scheduler: once is enough')
    test.setTimeout(180_000)
    await allowClerkOn(page)
    const owner = await seedChild(page, { withConsultation: false })
    const guest = await secondPerson(browser, design)
    await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email))
    await turnRemindersOn([
      { request: page.context().request, token: owner.token, accountId: owner.accountId },
      { request: guest.context.request, token: guest.token, accountId: guest.accountId! },
    ])

    // Two supplements that go off in about a minute (not due yet, so the guest can mute one before the scheduler looks).
    const soon = localParts(new Date(Date.now() + 70_000))
    const shared = await routineViaApi(page.context().request, owner.token, owner.childId, { name: 'Vitamina D', times: [soon.time] })
    const muted = await routineViaApi(page.context().request, owner.token, owner.childId, { name: 'Hierro', times: [soon.time] })
    const mute = await guest.context.request.put(`${API}/routines/${muted.id}/my-reminders`, {
      data: { enabled: false },
      headers: { Authorization: `Bearer ${guest.token}` },
    })
    expect(mute.status()).toBeLessThan(300)

    const remindedOf = (routineId: string) =>
      queryDb<{ account_id: string }>(
        `SELECT r.account_id FROM supplement_dose_reminders r JOIN supplement_doses d ON d.id = r.dose_id WHERE d.routine_id = $1`,
        [routineId],
      ).then((rows) => rows.map((x) => x.account_id).sort())

    await expect.poll(async () => (await remindedOf(shared.id)).length, { timeout: 150_000, intervals: [2_000] }).toBe(2)
    expect(await remindedOf(shared.id)).toEqual([owner.accountId, guest.accountId!].sort())
    // The muted one was looked at in the same ticks: only the owner has a reminder.
    expect(await remindedOf(muted.id)).toEqual([owner.accountId])
    await guest.context.close()
  })

  test('an appointment notice is claimed for each person with a device, and not for who turned «Tus avisos» off', async ({ page, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'it waits for the backend scheduler: once is enough')
    test.setTimeout(180_000)
    await allowClerkOn(page)
    const owner = await seedChild(page, { withConsultation: false })
    const guest = await secondPerson(browser, design)
    await acceptViaApi(guest.context.request, guest.token, await inviteViaApi(page.context().request, owner.token, guest.email))
    await turnRemindersOn([
      { request: page.context().request, token: owner.token, accountId: owner.accountId },
      { request: guest.context.request, token: guest.token, accountId: guest.accountId! },
    ])

    const today = localParts(new Date())
    const consultation = () =>
      apiPost(page.context().request, owner.token, `/children/${owner.childId}/consultations`, {
        doctorName: 'Dra. Laura Cázares',
        consultDate: today.day,
        photoBase64: PNG_BASE64,
        notes: '',
        utcOffsetMinutes: today.offset,
        medications: [{ name: 'Amoxicilina', frequencyHours: 8, durationDays: 1, startTime: today.time }],
      })
    // Each appointment is 4 minutes away with a notice 3 minutes before: it goes off in about a minute, after it was saved.
    const appointment = async (consultationId: string) => {
      const startsAt = new Date(Date.now() + 4 * 60_000)
      return apiPost(page.context().request, owner.token, `/consultations/${consultationId}/appointments`, {
        startsAt: startsAt.toISOString(),
        utcOffsetMinutes: -startsAt.getTimezoneOffset(),
        note: 'Revisión de oído',
        notices: [{ kind: 'before', leadMinutes: 3 }],
      })
    }
    const shared = await appointment((await consultation()).id)
    const muted = await appointment((await consultation()).id)
    const mute = await guest.context.request.put(`${API}/appointments/${muted.id}/my-reminders`, {
      data: { enabled: false },
      headers: { Authorization: `Bearer ${guest.token}` },
    })
    expect(mute.status()).toBeLessThan(300)

    const remindedOf = (appointmentId: string) =>
      queryDb<{ account_id: string }>(
        `SELECT r.account_id FROM appointment_notice_reminders r JOIN appointment_notices n ON n.id = r.notice_id WHERE n.appointment_id = $1`,
        [appointmentId],
      ).then((rows) => rows.map((x) => x.account_id).sort())

    await expect.poll(async () => (await remindedOf(shared.id)).length, { timeout: 150_000, intervals: [2_000] }).toBe(2)
    expect(await remindedOf(shared.id)).toEqual([owner.accountId, guest.accountId!].sort())
    expect(await remindedOf(muted.id)).toEqual([owner.accountId])
    await guest.context.close()
  })
})
