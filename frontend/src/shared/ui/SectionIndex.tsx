import { useEffect, useState, type MouseEvent } from 'react'

export interface IndexedSection {
  id: string
  label: string
}

/**
 * specs/056 (research R4): the index of a long page — «Consultas · Suplementos · Actividades · Cartilla» — as pills that jump to
 * each section, as the design draws them (all alike). On the phone it sticks to the top while scrolling; the pill of the section on
 * screen carries `aria-current` for screen readers.
 * Only the sections given are shown (a page passes only those that exist: never an empty section).
 */
export function SectionIndex({ sections, variant }: { sections: IndexedSection[]; variant: 'phone' | 'desktop' }) {
  const [current, setCurrent] = useState(sections[0]?.id)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setCurrent(visible.target.id)
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    for (const { id } of sections) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [sections])

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    setCurrent(id)
  }

  if (sections.length < 2) return null
  const phone = variant === 'phone'
  return (
    <nav
      aria-label="Secciones"
      className={`flex gap-2 overflow-x-auto leading-[normal] [scrollbar-width:none] ${phone ? 'sticky top-0 z-10 -mx-5 border-b border-hint-edge bg-canvas px-5 py-2' : 'flex-wrap'}`}
    >
      {sections.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => jump(e, id)}
          aria-current={current === id ? 'true' : undefined}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full border-[1.5px] border-hint-border bg-surface px-4 text-[15px] font-extrabold text-action no-underline hover:bg-hint"
        >
          {label}
        </a>
      ))}
    </nav>
  )
}
