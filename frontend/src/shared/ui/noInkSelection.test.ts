import { describe, it, expect } from 'vitest'

// specs/078: the chosen option of a "pick one" control is drawn in `action` through `shared/ui/selection`, never in ink.
const files = import.meta.glob(
  [
    '../../features/supplements/RoutineForm.tsx',
    '../../features/supplements/ActivityTypePicker.tsx',
    '../../features/appointments/AppointmentFields.tsx',
    '../../features/childRecord/RecordFormParts.tsx',
    '../../features/family/InviteForm.tsx',
    '../../features/family/merge/ChoiceCard.tsx',
    '../../features/growth/ChartCard.tsx',
    '../../features/medicineCabinet/CabinetFormPage.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const INK_FILL = /bg-ink\b|border-ink\b[^'"`]*bg-ink|bg-ink\b[^'"`]*text-white/

describe('the chosen option is never ink', () => {
  it('finds the eight files of the inventory', () => {
    expect(Object.keys(files)).toHaveLength(8)
  })

  it('no control paints its chosen option with an ink fill', () => {
    const offenders = Object.entries(files)
      .filter(([, source]) => INK_FILL.test(source))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('every control takes its chosen look from shared/ui/selection', () => {
    const missing = Object.entries(files)
      .filter(([, source]) => !source.includes('shared/ui/selection'))
      .map(([path]) => path)
    expect(missing).toEqual([])
  })

  it('the guard sees an ink fill when there is one', () => {
    expect(INK_FILL.test("on ? 'border-ink bg-ink text-white' : ''")).toBe(true)
  })
})
