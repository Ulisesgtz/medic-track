import type { ReactNode } from 'react'
import { Document, Page } from '@react-pdf/renderer'
import type { ExportData, ExportRequest } from '../types'
import { Consultations } from './Consultations'
import { Cover } from './Cover'
import { fullName, localDay } from './model'
import { PageFrame } from './PageFrame'
import type { PageIndex, PageLog } from './pageLog'
import { s } from './styles'
import { VaccinationCard } from './VaccinationCard'

/** What the document is made of: what was asked, what the server answered, the moment it is made and the logo's image. */
export interface DocumentInput {
  request: ExportRequest
  data: ExportData
  now: Date
  /** The PediTrack icon, as a URL the library can read (the app's own `/icon-192.png`, or a data: URL in tests). */
  icon: string
  /** Names of the history's symptom codes, for the cover's «Filtros». */
  symptomNames?: Record<string, string>
}

/**
 * The history's PDF (specs/050, the mock «Exportar PDF - Documento»): Letter pages with the header and the footer on every one, the
 * cover, then the consultations and the card. Each part is its own `Page` (as many sheets as it needs): a part that started with a
 * break inside the cover's page counted that empty piece as its first sub-page. It is pure layout: every sentence is in
 * exportText.ts and every value is shaped by model.ts.
 */
export function HistoryDocument({ input, index, log }: { input: DocumentInput; index: PageIndex | null; log: PageLog }) {
  const { request, data, now } = input
  const name = fullName(data.child)
  const sheet = (children: ReactNode, extra?: typeof s.consultationsPage) => (
    <Page size="LETTER" style={extra ? [s.page, extra] : s.page}>
      <PageFrame name={name} date={localDay(now)} icon={input.icon} log={log} />
      {children}
    </Page>
  )
  return (
    <Document title={`Historial de ${name}`} creator="PediTrack" producer="PediTrack" language="es-MX">
      {sheet(<Cover request={request} data={data} now={now} index={index} symptomNames={input.symptomNames} />)}
      {request.sections.consultations &&
        data.consultations.length > 0 &&
        sheet(<Consultations consultations={data.consultations} log={log} index={index} />, s.consultationsPage)}
      {request.sections.vaccinations && data.vaccinations.length > 0 && sheet(<VaccinationCard vaccinations={data.vaccinations} log={log} />)}
    </Document>
  )
}
