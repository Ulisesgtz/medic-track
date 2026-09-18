/**
 * Shared Tailwind class recipes for form fields (design-tokens.md,
 * "Recetas de implementación"). One place so a change to the field look
 * lands on every form at once.
 */
const inputBase =
  'min-h-11 w-full rounded-[14px] bg-surface px-4 py-2.5 text-base font-medium text-ink placeholder-slate-500 outline-none focus:border-ink'

export const inputClass = `${inputBase} border-[1.5px] border-slate-300 focus:ring-[0.5px] focus:ring-ink`
/** A field the OCR filled in: bright border until the parent reviews it. */
export const suggestedInputClass = `${inputBase} border-2 border-bright`
export const labelClass = 'mb-1.5 block text-[13px] font-bold text-ink'
export const errorClass = 'mt-1.5 block text-sm font-semibold text-red-700'
export const overlineClass = 'text-xs font-extrabold uppercase tracking-[0.1em] text-action'
export const optionalClass = 'font-medium text-slate-500'
