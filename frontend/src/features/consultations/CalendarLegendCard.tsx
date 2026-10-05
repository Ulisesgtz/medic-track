/**
 * "Cómo leer el calendario" (specs/022): the key of the treatment calendar in the web design's right column, under the
 * active treatment. A filled dot is a dose that was given, an empty one a dose not given (yet or never marked — it is not
 * always "sin registrar"), and the pale pill a day inside the treatment. The phone design doesn't have it.
 */
export function CalendarLegendCard() {
  return (
    <section aria-labelledby="calendar-legend-title" className="flex flex-col gap-3 rounded-3xl bg-surface p-[22px] shadow-[0_8px_24px_rgba(4,37,43,0.06)]">
      <h2 id="calendar-legend-title" className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink">
        Cómo leer el calendario
      </h2>
      <ul className="flex flex-col gap-3 text-sm font-semibold text-calendar-text">
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className="box-border h-2.5 w-2.5 shrink-0 rounded-full border-2 border-action bg-action" />
          Punto relleno: dosis dada
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className="box-border h-2.5 w-2.5 shrink-0 rounded-full border-2 border-action" />
          Punto vacío: dosis sin dar
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-3.5 w-[18px] shrink-0 rounded border border-hint-edge bg-hint" />
          Día dentro del tratamiento
        </li>
      </ul>
    </section>
  )
}
