import { describe, it, expect } from 'vitest'
import {
  errorClass,
  fieldAuth,
  fieldBorder,
  fieldCompact,
  fieldMedication,
  fieldModal,
  fieldMultiline,
  fieldProposed,
  labelClass,
} from './formStyles'

// The classes each screen had before they moved here (BACKLOG, "Unificar estilos de formulario"). Moving them was meant to
// change nothing on screen, so each preset must stay the same set of classes (order does not matter to CSS).
const classes = (value: string) => [...new Set(value.split(/\s+/).filter(Boolean))].sort()

describe('formStyles', () => {
  it('fieldAuth: phone sign-up, login, recovery and the Google completion (16 px radius)', () => {
    expect(classes(fieldAuth)).toEqual(
      classes('min-h-11 w-full min-w-0 rounded-2xl border-[1.5px] px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none'),
    )
  })

  it('fieldCompact: web sign-up and the children fields (12 px radius)', () => {
    expect(classes(fieldCompact)).toEqual(
      classes('min-h-11 w-full min-w-0 rounded-xl border-[1.5px] px-4 py-3 text-base font-medium text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none'),
    )
  })

  it('fieldModal: the "Agregar hijo" modal (14 px radius on the surface)', () => {
    expect(classes(fieldModal)).toEqual(
      classes('min-h-11 w-full min-w-0 rounded-[14px] border-[1.5px] bg-surface px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none'),
    )
  })

  it('fieldMedication: the medication row (regular weight, no border of its own)', () => {
    expect(classes(fieldMedication)).toEqual(
      classes('min-h-11 w-full min-w-0 rounded-xl px-4 py-3 text-base text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none'),
    )
  })

  it('fieldMultiline: the notes box (no minimum height)', () => {
    expect(classes(fieldMultiline)).toEqual(
      classes('w-full min-w-0 rounded-xl border-[1.5px] border-slate-300 bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none'),
    )
  })

  it('fieldProposed: a field the OCR filled (bright border, no placeholder)', () => {
    expect(classes(fieldProposed)).toEqual(
      classes('min-h-11 w-full min-w-0 rounded-xl border-2 border-bright bg-surface px-4 py-3 text-base text-ink focus:border-ink focus:outline-none'),
    )
  })

  it('no preset lets a placeholder fall below slate-500 (4.5:1; slate-400 is ~2.6:1)', () => {
    for (const preset of [fieldAuth, fieldCompact, fieldModal, fieldMedication, fieldMultiline]) {
      expect(preset).toContain('placeholder:text-slate-500')
      expect(preset).not.toContain('slate-400')
    }
  })

  it('fieldBorder: red for an invalid value, the given color otherwise (slate-300 by default)', () => {
    expect(fieldBorder(true)).toBe('border-red-600')
    expect(fieldBorder(true, 'border-bright-soft')).toBe('border-red-600')
    expect(fieldBorder(false)).toBe('border-slate-300')
    expect(fieldBorder(false, 'border-bright-soft')).toBe('border-bright-soft')
  })

  it('label and error keep the project sizes: 13 px, error in red-700', () => {
    expect(labelClass).toBe('text-[13px] font-bold text-ink-soft')
    expect(errorClass).toBe('text-[13px] font-semibold text-red-700')
  })
})
