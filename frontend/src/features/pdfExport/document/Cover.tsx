import { Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { ReactElement } from 'react'
import { RECORD, bloodLabel, updatedLine } from '../../childRecord/recordText'
import { DOC } from '../exportText'
import { photoCount } from '../photos'
import type { ExportData, ExportRecord, ExportRequest } from '../types'
import { activeTreatmentLines, ageText, appointmentWhen, coverCount, coverRows, day, fullName, showsRecord } from './model'
import type { PageIndex, SectionKey } from './pageLog'
import { COLOR, px, s } from './styles'

export interface CoverProps {
  request: ExportRequest
  data: ExportData
  now: Date
  /** The page of each section; null while the document is laid out the first time. */
  index: PageIndex | null
  symptomNames?: Record<string, string>
}

/** The first page (FR-012): who, what the PDF includes, the count, the running treatment, the next appointment and the contents. */
export function Cover({ request, data, now, index, symptomNames }: CoverProps) {
  const { child } = data
  // A person's own history (specs/058) has no birth date, height or weight: only their name.
  const facts =
    data.subject === 'person'
      ? []
      : [
          { label: DOC.birth, value: day(child.birthDate) },
          { label: DOC.age, value: ageText(child.birthDate, now) },
          { label: DOC.height, value: child.height == null ? DOC.noData : DOC.heightValue(child.height) },
          { label: DOC.weight, value: child.weight == null ? DOC.noData : DOC.weightValue(child.weight) },
        ]
  // specs/073 (mock F): with the record the cover is compacted (title 38 px, summary 16 px, less space) so it still fits one sheet,
  // and the record goes before the running treatment and the appointment, which come before «Qué incluye».
  const record = showsRecord(request, data) ? (data.record as ExportRecord) : null
  const block = record ? [s.coverBlock, { marginBottom: px(12) }] : s.coverBlock
  const contents: { key: SectionKey | 'record'; label: string }[] = []
  if (record) contents.push({ key: 'record', label: DOC.contentsRecord })
  if (request.sections.consultations && data.consultations.length > 0) contents.push({ key: 'consultations', label: DOC.contentsConsultations })
  if (request.sections.vaccinations && data.vaccinations.length > 0) contents.push({ key: 'card', label: DOC.contentsCard })
  if (request.sections.photos && photoCount(data.photos) > 0) contents.push({ key: 'annex', label: DOC.contentsAnnex })

  return (
    <View style={s.cover}>
      <View style={block}>
        <Text style={s.eyebrow}>{DOC.coverEyebrow}</Text>
        <Text style={record ? [s.coverTitle, { fontSize: px(38), letterSpacing: px(38 * -0.03) }] : s.coverTitle}>{fullName(child)}</Text>
      </View>

      {facts.length > 0 && (
        <View style={[block, s.facts]}>
          {facts.map((fact, i) => (
            <View key={fact.label} style={[i === 0 ? s.factFirst : s.fact, record ? { paddingVertical: px(8) } : {}]}>
              <Text style={s.factLabel}>{fact.label}</Text>
              <Text style={s.factValue}>{fact.value}</Text>
            </View>
          ))}
        </View>
      )}

      {record && <RecordBlock record={record} />}
      {record && <CurrentBoxes data={data} style={block} compact />}

      <View style={block}>
        <Text style={s.eyebrow}>{DOC.includes}</Text>
        <View style={record ? [s.includesRows, { marginTop: px(8) }] : s.includesRows}>
          {coverRows(request, data, symptomNames).map((row) => (
            <View key={row.label} style={record ? s.includesRowCompact : s.includesRow}>
              <Text style={s.includesLabel}>{row.label}</Text>
              <Text style={[s.includesValue, row.strong ? { fontWeight: 700 } : {}]}>{row.value}</Text>
            </View>
          ))}
        </View>
        <Text style={record ? [s.count, { fontSize: px(16), paddingVertical: px(8), marginTop: px(2) }] : s.count}>{coverCount(request, data)}</Text>
      </View>

      {!record && <CurrentBoxes data={data} style={s.coverBlock} />}

      {request.sections.consultations && data.consultations.length === 0 && (
        <EmptyBox title={DOC.noConsultationsTitle} text={DOC.noConsultations} />
      )}
      {request.sections.vaccinations && data.vaccinations.length === 0 && <EmptyBox title={DOC.noVaccinationsTitle} text={DOC.noVaccinations} />}

      {contents.length > 0 && (
        <View style={block}>
          <Text style={s.eyebrow}>{DOC.contents}</Text>
          {contents.map(({ key, label }) => {
            // The record is on the cover itself: page 1.
            const span = key === 'record' ? { first: 1, last: 1 } : index?.sections[key]
            return (
              <View key={key} style={record ? s.contentsRowCompact : s.contentsRow}>
                <Text>{label}</Text>
                {/* The first layout writes a stand-in of the same size, so the second one doesn't move anything. */}
                <Text style={s.contentsPage}>{span ? DOC.pages(span.first, span.last) : DOC.pages(0, 0)}</Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

/** The running treatment and the next appointment, side by side, when there are. */
function CurrentBoxes({ data, style, compact = false }: { data: ExportData; style: Style | Style[]; compact?: boolean }) {
  const { activeTreatment: treatment, nextAppointment: appointment } = data
  if (!treatment && !appointment) return null
  const lines = treatment ? activeTreatmentLines(treatment) : null
  return (
    <View style={[style, s.boxes]}>
      {treatment && lines ? (
        <View style={[compact ? s.boxCompact : s.box, { borderColor: COLOR.ink }]}>
          <Text style={s.boxEyebrow}>{DOC.activeTreatment}</Text>
          <Text style={s.boxValue}>{treatment.medicationName}</Text>
          <Text style={s.boxLine}>{lines.schedule}</Text>
          {lines.doctor && <Text style={s.boxSmall}>{lines.doctor}</Text>}
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={s.boxGap} />
      {appointment ? (
        <View style={[compact ? s.boxCompact : s.box, { borderColor: COLOR.rule }]}>
          <Text style={s.boxEyebrow}>{DOC.nextAppointment}</Text>
          <Text style={s.boxValue}>{appointmentWhen(appointment, ' · ')}</Text>
          {appointment.doctorName.trim() !== '' && <Text style={s.boxLine}>{appointment.doctorName}</Text>}
          {appointment.location.trim() !== '' && <Text style={s.boxSmall}>{appointment.location}</Text>}
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  )
}

function EmptyBox({ title, text }: { title: string; text: string }) {
  return (
    <View style={[s.coverBlock, s.emptyBox]}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  )
}

/** «Ficha» (mock F): an ink-bordered block with what the family wrote, as written, and the fixed sentence. Nothing is graded. */
function RecordBlock({ record }: { record: ExportRecord }) {
  const p = record.pediatrician
  const has = (v: string | null | undefined) => !!v && v.trim() !== ''
  const cells: { key: string; node: ReactElement }[] = []
  if (record.allergies.length > 0)
    cells.push({
      key: 'allergies',
      node: (
        <>
          <Text style={s.recordLabel}>{RECORD.allergies}</Text>
          {record.allergies.map((a, i) => (
            <Text key={i} style={s.recordLine}>
              <Text style={{ fontWeight: 800 }}>{a.name}</Text>
              {a.kind ? ` · ${RECORD.kinds[a.kind]}` : ''}
              {has(a.note) ? ` — ${a.note}` : ''}
            </Text>
          ))}
        </>
      ),
    })
  if (record.conditions.length > 0)
    cells.push({
      key: 'conditions',
      node: (
        <>
          <Text style={s.recordLabel}>{RECORD.conditions}</Text>
          {record.conditions.map((c, i) => (
            <Text key={i} style={s.recordLine}>
              <Text style={{ fontWeight: 800 }}>{c.name}</Text>
              {has(c.note) ? ` — ${c.note}` : ''}
            </Text>
          ))}
        </>
      ),
    })
  if (record.bloodType !== null)
    cells.push({
      key: 'blood',
      node: (
        <>
          <Text style={s.recordLabel}>{RECORD.bloodType}</Text>
          <Text style={{ fontSize: px(18), fontWeight: 900 }}>{bloodLabel(record.bloodType)}</Text>
        </>
      ),
    })
  if (p && (has(p.name) || has(p.phone) || has(p.office)))
    cells.push({
      key: 'pediatrician',
      node: (
        <>
          <Text style={s.recordLabel}>{RECORD.pediatrician}</Text>
          {has(p.name) && <Text style={[s.recordLine, { fontWeight: 800 }]}>{p.name}</Text>}
          {has(p.phone) && <Text style={s.recordLine}>{p.phone}</Text>}
          {has(p.office) && <Text style={[s.recordLine, { color: COLOR.body }]}>{p.office}</Text>}
        </>
      ),
    })
  return (
    <View style={[s.recordBox, { marginBottom: px(12) }]}>
      <View style={s.recordHead}>
        <Text style={s.eyebrow}>{DOC.sectionRecord}</Text>
        {record.updated && <Text style={s.recordUpdated}>{updatedLine(record.updated.at, record.updated.by)}</Text>}
      </View>
      <View style={s.recordGrid}>
        {cells.map(({ key, node }) => (
          <View key={key} style={[s.recordCell, { marginBottom: px(6) }]}>
            {node}
          </View>
        ))}
      </View>
      {has(record.generalNote) && (
        <Text style={s.recordNote}>
          <Text style={{ fontSize: px(13), fontWeight: 700, color: COLOR.body }}>{`${RECORD.generalNote} · `}</Text>
          {record.generalNote}
        </Text>
      )}
      <Text style={s.recordPhrase}>{RECORD.phrase}</Text>
    </View>
  )
}
