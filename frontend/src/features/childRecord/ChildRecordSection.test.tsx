import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubApi, stubWeb } from '../medicineCabinet/cabinet.test-utils'
import { ChildRecordSection } from './ChildRecordSection'
import { emptyRecord, fullRecord } from './recordFixtures'

function show(variant: 'phone' | 'desktop') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChildRecordSection childId="child-1" variant={variant} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

for (const variant of ['phone', 'desktop'] as const) {
  describe(`ChildRecordSection (${variant})`, () => {
    afterEach(() => vi.unstubAllGlobals())
    const setup = (body: unknown, status = 200) => {
      stubWeb(variant === 'desktop')
      return stubApi({ 'GET /children/child-1/record': { status, body } })
    }

    it('shows what was written, in order, with the neutral kinds, the call link and the fixed sentence (A)', async () => {
      setup(fullRecord)
      show(variant)
      await screen.findAllByRole('heading', { level: 3 })
      const section = screen.getByRole('region', { name: 'Ficha' })
      expect(within(section).getByRole('heading', { level: 2, name: 'Ficha' })).toBeInTheDocument()
      expect(within(section).getByText('Penicilina')).toBeInTheDocument()
      expect(within(section).getByText('Medicamento')).toBeInTheDocument()
      expect(within(section).getByText('Alimento')).toBeInTheDocument()
      expect(within(section).getByText('le salen ronchas')).toBeInTheDocument()
      expect(within(section).getByText('O+')).toBeInTheDocument()
      expect(within(section).getByText('Asma')).toBeInTheDocument()
      expect(within(section).getByText('Usa lentes desde los 4 años.')).toBeInTheDocument()
      expect(within(section).getByText(/^Actualizada el 1[67] nov 2026 por Ana$/)).toBeInTheDocument()
      expect(within(section).getByText('Lo anotado es lo que la familia escribió y no sustituye la opinión de su médico.')).toBeInTheDocument()
      expect(within(section).getByRole('link', { name: 'Llamar a Dra. Ruiz' })).toHaveAttribute('href', 'tel:+523312345678')
      expect(within(section).getByRole('link', { name: 'Editar ficha' })).toHaveAttribute('href', '/children/child-1/ficha/editar')
      const text = section.textContent ?? ''
      expect(text.indexOf('Penicilina')).toBeLessThan(text.indexOf('Cacahuate'))
      expect(text.indexOf('Cacahuate')).toBeLessThan(text.indexOf('Polen'))
    })

    it('does not show empty groups and never writes an absence', async () => {
      setup({ ...fullRecord, allergies: [], bloodType: null, pediatrician: { name: null, phone: null, office: null }, generalNote: ' ' })
      show(variant)
      await screen.findAllByRole('heading', { level: 3 })
      const section = screen.getByRole('region', { name: 'Ficha' })
      expect(within(section).queryByText('Alergias')).toBeNull()
      expect(within(section).queryByText('Tipo de sangre')).toBeNull()
      expect(within(section).queryByText('Pediatra de cabecera')).toBeNull()
      expect(within(section).queryByText('Nota general')).toBeNull()
      expect(within(section).getByText('Padecimientos o condiciones permanentes')).toBeInTheDocument()
      expect(section.textContent).not.toMatch(/Sin alergias|Sin padecimientos/)
    })

    it('shows the blood type «No lo sé» and a phone without a call link when it has no digits', async () => {
      setup({ ...fullRecord, bloodType: 'unknown', pediatrician: { name: null, phone: 'ext. abc', office: null } })
      show(variant)
      await screen.findAllByRole('heading', { level: 3 })
      const section = screen.getByRole('region', { name: 'Ficha' })
      expect(within(section).getByText('No lo sé')).toBeInTheDocument()
      expect(within(section).queryByRole('link', { name: /Llamar/ })).toBeNull()
    })

    it('an empty record invites neutrally to start it (B)', async () => {
      setup(emptyRecord)
      show(variant)
      expect(await screen.findByText('Aún no hay ficha')).toBeInTheDocument()
      expect(screen.getByText(/Anota alergias, tipo de sangre, padecimientos y su pediatra/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Empezar la ficha' })).toHaveAttribute('href', '/children/child-1/ficha/editar')
      expect(screen.queryByRole('link', { name: 'Editar ficha' })).toBeNull()
    })

    it('a Caregiver sees the whole record and «Llamar» but no edit button, with the line that only the family edits (C)', async () => {
      setup({ ...fullRecord, canEdit: false })
      show(variant)
      await screen.findAllByRole('heading', { level: 3 })
      const section = screen.getByRole('region', { name: 'Ficha' })
      expect(within(section).getByRole('note')).toHaveTextContent('Puedes ver la ficha y llamar al pediatra. Solo la familia puede editarla.')
      expect(within(section).getByRole('link', { name: 'Llamar a Dra. Ruiz' })).toBeInTheDocument()
      expect(within(section).queryByRole('link', { name: 'Editar ficha' })).toBeNull()
      expect(within(section).queryByRole('button')).toBeNull()
    })

    it('a Caregiver with no record sees no invitation to write one', async () => {
      setup({ ...emptyRecord, canEdit: false })
      show(variant)
      expect(await screen.findByText('Aún no hay ficha')).toBeInTheDocument()
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.getByText(/Solo la familia puede editarla/)).toBeInTheDocument()
    })

    it('shows a loading block, then the load error with «Reintentar»', async () => {
      const mock = setup({ message: 'x' }, 500)
      show(variant)
      expect(screen.getByRole('status', { name: 'Cargando la ficha…' })).toBeInTheDocument()
      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la ficha.')
      mock.mockClear()
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(mock).toHaveBeenCalledTimes(1)
    })
  })
}
