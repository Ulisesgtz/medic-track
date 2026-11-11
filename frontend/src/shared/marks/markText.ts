// The words of a mark that travels or didn't get saved (specs/066, research R7). They say what happened to the MARK — never
// anything about the medication or what to do with it (Principio I) — and never call it a mistake.

export const SAVING = 'guardando…'
export const CLOSE = 'Cerrar'
export const NOTICE_LABEL = 'Avisos de las marcas'

export type MarkNoticeKind = 'not_saved' | 'not_unmarked' | 'marked_by_other' | 'not_yours' | 'gone'

const what = (name: string, time: string) => (name ? `${name} de las ${time}` : `las ${time}`)

export const notSaved = (name: string, time: string) => `No se guardó la marca de ${what(name, time)}. Revisa tu conexión e inténtalo de nuevo.`
export const notUnmarked = (name: string, time: string) => `No se quitó la marca de ${what(name, time)}. Revisa tu conexión e inténtalo de nuevo.`
export const markedByOther = (by: string, name: string, time: string) => `${by} ya había marcado ${what(name, time)}.`
export const NOT_YOURS = 'Solo quien la marcó o un Tutor puede quitar esta marca.'
export const GONE = 'No se guardó la marca. Esta toma ya no está disponible.'
export const andMore = (n: number) => `y ${n} más`

export function noticeText(notice: { kind: MarkNoticeKind; name: string; time: string; by?: string }): string {
  switch (notice.kind) {
    case 'not_saved':
      return notSaved(notice.name, notice.time)
    case 'not_unmarked':
      return notUnmarked(notice.name, notice.time)
    case 'marked_by_other':
      return markedByOther(notice.by || 'Otra persona', notice.name, notice.time)
    case 'not_yours':
      return NOT_YOURS
    case 'gone':
      return GONE
  }
}
