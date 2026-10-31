import { Text, View } from '@react-pdf/renderer'
import { DOC } from '../exportText'
import type { ExportData, ExportRequest } from '../types'
import { activeTreatmentLines, ageText, appointmentWhen, coverCount, coverRows, day, fullName } from './model'
import type { PageIndex, SectionKey } from './pageLog'
import { COLOR, s } from './styles'

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
  const facts = [
    { label: DOC.birth, value: day(child.birthDate) },
    { label: DOC.age, value: ageText(child.birthDate, now) },
    { label: DOC.height, value: child.height == null ? DOC.noData : DOC.heightValue(child.height) },
    { label: DOC.weight, value: child.weight == null ? DOC.noData : DOC.weightValue(child.weight) },
  ]
  const contents: { key: SectionKey; label: string }[] = []
  if (request.sections.consultations && data.consultations.length > 0) contents.push({ key: 'consultations', label: DOC.contentsConsultations })
  if (request.sections.vaccinations && data.vaccinations.length > 0) contents.push({ key: 'card', label: DOC.contentsCard })

  return (
    <View style={s.cover}>
      <View style={s.coverBlock}>
        <Text style={s.eyebrow}>{DOC.coverEyebrow}</Text>
        <Text style={s.coverTitle}>{fullName(child)}</Text>
      </View>

      <View style={[s.coverBlock, s.facts]}>
        {facts.map((fact, i) => (
          <View key={fact.label} style={i === 0 ? s.factFirst : s.fact}>
            <Text style={s.factLabel}>{fact.label}</Text>
            <Text style={s.factValue}>{fact.value}</Text>
          </View>
        ))}
      </View>

      <View style={s.coverBlock}>
        <Text style={s.eyebrow}>{DOC.includes}</Text>
        <View style={s.includesRows}>
          {coverRows(request, data, symptomNames).map((row) => (
            <View key={row.label} style={s.includesRow}>
              <Text style={s.includesLabel}>{row.label}</Text>
              <Text style={[s.includesValue, row.strong ? { fontWeight: 700 } : {}]}>{row.value}</Text>
            </View>
          ))}
        </View>
        <Text style={s.count}>{coverCount(request, data)}</Text>
      </View>

      <CurrentBoxes data={data} />

      {request.sections.consultations && data.consultations.length === 0 && (
        <EmptyBox title={DOC.noConsultationsTitle} text={DOC.noConsultations} />
      )}
      {request.sections.vaccinations && data.vaccinations.length === 0 && <EmptyBox title={DOC.noVaccinationsTitle} text={DOC.noVaccinations} />}

      {contents.length > 0 && (
        <View style={s.coverBlock}>
          <Text style={s.eyebrow}>{DOC.contents}</Text>
          {contents.map(({ key, label }) => {
            const span = index?.sections[key]
            return (
              <View key={key} style={s.contentsRow}>
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
function CurrentBoxes({ data }: { data: ExportData }) {
  const { activeTreatment: treatment, nextAppointment: appointment } = data
  if (!treatment && !appointment) return null
  const lines = treatment ? activeTreatmentLines(treatment) : null
  return (
    <View style={[s.coverBlock, s.boxes]}>
      {treatment && lines ? (
        <View style={[s.box, { borderColor: COLOR.ink }]}>
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
        <View style={[s.box, { borderColor: COLOR.rule }]}>
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
