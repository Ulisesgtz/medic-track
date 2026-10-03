// The classes of the form fields, in one place (BACKLOG, "Unificar estilos de formulario"). They used to be written out in
// each screen, six copies of the invalid-border rule included. Every preset below is exactly what some screen already
// had: the mocks differ on purpose (spec 007: the phone sign-up has 16 px radius and 14 px padding, the web one 12 and
// 12, the modal 14), so this file names those variants instead of flattening them. `formStyles.test.ts` pins each preset's
// classes: changing one is a visual decision, never a side effect.
//
// Placeholders are `slate-500` at least: `slate-400` on white is ~2.6:1 (design-tokens.md).

const BASE = 'min-h-11 w-full min-w-0 text-base text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none'
const BORDER_WIDTH = 'border-[1.5px]'

/** Phone sign-up/login/recovery (mock 01 and its siblings): 16 px radius, tall (py-3.5). */
export const fieldAuth = `${BASE} ${BORDER_WIDTH} rounded-2xl px-4 py-3.5 font-medium`

/** Web sign-up and the children's fields on the phone: 12 px radius (py-3). */
export const fieldCompact = `${BASE} ${BORDER_WIDTH} rounded-xl px-4 py-3 font-medium`

/** The "Agregar hijo" modal (board screen 7): 14 px radius on the surface. */
export const fieldModal = `${BASE} ${BORDER_WIDTH} rounded-[14px] bg-surface px-4 py-3.5 font-medium`

/** The medication row's inputs (mocks 04/14): like `fieldCompact` but regular weight, with no border color of its own. */
export const fieldMedication = 'min-h-11 w-full min-w-0 rounded-xl px-4 py-3 text-base text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none'

/** A multi-line box (the consultation's notes): the compact field without a minimum height. */
export const fieldMultiline = `w-full min-w-0 ${BORDER_WIDTH} rounded-xl border-slate-300 bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none`

/** A field the OCR proposed ("revisa y confirma"): the bright 2 px border, no placeholder. */
export const fieldProposed = 'min-h-11 w-full min-w-0 rounded-xl border-2 border-bright bg-surface px-4 py-3 text-base text-ink focus:border-ink focus:outline-none'

/** The border of a field: the one red for an invalid value (a form error, never a medical alert), else `normal`. */
export const fieldBorder = (invalid: boolean, normal = 'border-slate-300') => (invalid ? 'border-red-600' : normal)

/** The label above a field and the inline error under it. */
export const labelClass = 'text-[13px] font-bold text-ink-soft'
export const errorClass = 'text-[13px] font-semibold text-red-700'
