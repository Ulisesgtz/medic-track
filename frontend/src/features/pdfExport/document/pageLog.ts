// specs/050: where each part of the document landed. The PDF library only tells an element its page while it lays the document out,
// so invisible markers at the start and at the end of each section and of each consultation write their page here; the document is
// laid out once to learn them and a second time with the cover's index and the «continúa» lines filled in (both go where they take no
// room from the content, so nothing moves).
//
// The library calls a marker several times while it tries page breaks and once more, in order, when the layout is final (checked with
// 4.9.0): the last call is the true page, so each one overwrites the one before.

export type SectionKey = 'consultations' | 'card' | 'annex'

export interface PageSpan {
  first: number
  last: number
}

export interface PageIndex {
  sections: Partial<Record<SectionKey, PageSpan>>
  /** The pages of each consultation, by id. */
  consultations: Record<string, PageSpan>
}

type Edge = 'start' | 'end'

export class PageLog {
  private marks = new Map<string, number>()
  /** The number of pages, as the footer was told. */
  total = 0

  /** A marker of a section's or a consultation's start or end was drawn on `page`. */
  at(key: string, edge: Edge, page: number) {
    this.marks.set(`${key}|${edge}`, page)
  }

  /** The footer was told the number of pages (the library asks it once before it knows them: then it isn't a number). */
  pages(total: number) {
    if (Number.isFinite(total)) this.total = Math.max(this.total, total)
  }

  private span(key: string): PageSpan | undefined {
    const first = this.marks.get(`${key}|start`)
    const last = this.marks.get(`${key}|end`)
    return first === undefined || last === undefined ? undefined : { first, last: Math.max(first, last) }
  }

  index(): PageIndex {
    const sections: PageIndex['sections'] = {}
    for (const key of ['consultations', 'card', 'annex'] as SectionKey[]) {
      const span = this.span(`section:${key}`)
      if (span) sections[key] = span
    }
    const consultations: PageIndex['consultations'] = {}
    for (const mark of this.marks.keys()) {
      const id = /^consultation:(.+)\|start$/.exec(mark)?.[1]
      const span = id === undefined ? undefined : this.span(`consultation:${id}`)
      if (id !== undefined && span) consultations[id] = span
    }
    return { sections, consultations }
  }
}

/** The consultation that crosses from `page` to the next one, if any. */
export function continuesOn(index: PageIndex | null, page: number): string | null {
  for (const [id, span] of Object.entries(index?.consultations ?? {})) if (span.first <= page && page < span.last) return id
  return null
}

/** The consultation that comes from the page before and goes on at the top of `page`, if any. */
export function continuedOn(index: PageIndex | null, page: number): string | null {
  for (const [id, span] of Object.entries(index?.consultations ?? {})) if (span.first < page && page <= span.last) return id
  return null
}
