import { Image, Text, View } from '@react-pdf/renderer'
import { DOC } from '../exportText'
import type { ExportConsultation, ExportMedication } from '../types'

import { Marker } from './Marker'
import { Arrow, DoseMark } from './Marks'
import { appointmentWhen, day, doseMarks, doseRecord, indication, statusLabels } from './model'
import { continuedOn, continuesOn, type PageIndex, type PageLog } from './pageLog'
import { px, s } from './styles'

/**
 * «Consultas» (FR-013), the most recent first, on pages of their own. A consultation that crosses a page closes it with «Continúa en
 * la página N →» and starts the next with its date, its doctor and «(continuación)» (FR-015). Those two lines are pieces of the page
 * itself, in the margins between the content and the header or the footer, drawn from where the first layout put each consultation:
 * inside the content they would change where the pages break.
 */
export function Consultations({
  consultations,
  log,
  index,
  photos,
}: {
  consultations: ExportConsultation[]
  log: PageLog
  index: PageIndex | null
  /** The prescription photos in the annex (each as its JPEG, or null if it couldn't be included); none when the annex is off. */
  photos?: Record<string, string | null>
}) {
  const byId = new Map(consultations.map((c) => [c.id, c]))
  return (
    <>
      <View
        fixed
        style={s.continuedLine}
        render={({ pageNumber }) => {
          const c = byId.get(continuedOn(index, pageNumber) ?? '')
          return c ? <Text>{[day(c.consultDate), c.doctorName.trim()].filter(Boolean).join(' · ') + ` ${DOC.continuation}`}</Text> : null
        }}
      />
      {/* Two pieces: the library doesn't lay out the children of a dynamic view (they lose their place), only a dynamic text. */}
      <Text fixed style={s.continuesText} render={({ pageNumber }) => (continuesOn(index, pageNumber) ? DOC.continuesOn(pageNumber + 1) : '')} />
      <View fixed style={s.continuesArrow} render={({ pageNumber }) => (continuesOn(index, pageNumber) ? <Arrow /> : null)} />
      <View>
        <Marker log={log} name="section:consultations" edge="start" />
        <View style={s.sectionHead} minPresenceAhead={120}>
          <Text style={s.sectionTitle}>{DOC.consultationsTitle}</Text>
          <Text style={s.sectionCount}>{DOC.consultationsCount(consultations.length)}</Text>
        </View>
        {consultations.map((c) => (
          <Consultation key={c.id} consultation={c} log={log} index={index} photos={photos} />
        ))}
        <Marker log={log} name="section:consultations" edge="end" />
      </View>
    </>
  )
}

function Consultation({
  consultation: c,
  log,
  index,
  photos,
}: {
  consultation: ExportConsultation
  log: PageLog
  index: PageIndex | null
  photos?: Record<string, string | null>
}) {
  const inAnnex = photos !== undefined && c.id in photos
  const absent = [c.symptoms.length === 0 ? DOC.nothingMarked : null, c.medications.length === 0 ? DOC.noMedications : null].filter(Boolean)
  return (
    <View style={s.consultation}>
      <View wrap={false} minPresenceAhead={60}>
        <Marker log={log} name={`consultation:${c.id}`} edge="start" />
        <View style={s.consultationRule} />
        <View style={s.consultationTop}>
          <View style={inAnnex ? s.consultationTopMain : { flex: 1 }}>
            <View style={s.consultationHead}>
              <Text style={s.consultationDate}>{day(c.consultDate)}</Text>
              {c.doctorName.trim() !== '' && <Text style={s.consultationDoctor}>{c.doctorName}</Text>}
              {c.recordOnly && <Text style={[s.status, s.statusSoft]}>{DOC.recordOnly}</Text>}
            </View>
            {c.symptoms.length > 0 && (
              <View style={s.symptoms}>
                <Text style={s.symptomsLabel}>{DOC.symptoms}</Text>
                {c.symptoms.map((symptom) => (
                  <Text key={symptom.code} style={s.pill}>
                    {symptom.name}
                  </Text>
                ))}
              </View>
            )}
          </View>
          {inAnnex && <PrescriptionThumb src={photos[c.id]} page={index?.photos[`consultation:${c.id}`] ?? 0} />}
        </View>
      </View>

      {c.notes.trim() !== '' && (
        <View style={s.part}>
          <Text style={s.labelCaps} minPresenceAhead={30}>
            {DOC.notes}
          </Text>
          <Text style={s.notes}>{c.notes.trim()}</Text>
        </View>
      )}

      {absent.length > 0 && <Text style={s.plainLine}>{absent.join(' · ')}</Text>}

      {c.medications.length > 0 && (
        <View style={s.part}>
          {/* The label travels inside the first medication's unbreakable block: it never stays alone at the foot of a page. */}
          {c.medications.map((med, i) => (
            <Medication key={i} med={med} consultDate={c.consultDate} rule={i < c.medications.length - 1} label={i === 0} />
          ))}
        </View>
      )}

      {c.appointment && (
        <View style={s.appointment} wrap={false}>
          <Text style={s.appointmentLabel}>{DOC.nextAppointment}</Text>
          <Text style={s.appointmentText}>
            <Text style={{ fontWeight: 800 }}>{appointmentWhen(c.appointment, ', ')}</Text>
            {[c.appointment.doctorName, c.appointment.location]
              .map((t) => t.trim())
              .filter(Boolean)
              .map((t) => ` · ${t}`)
              .join('')}
          </Text>
        </View>
      )}
      <Marker log={log} name={`consultation:${c.id}`} edge="end" />
    </View>
  )
}

/** The prescription's photo beside the consultation's head and the page of the annex where it is whole (the mock's «Foto en p. 5»). */
function PrescriptionThumb({ src, page }: { src: string | null; page: number }) {
  return (
    <View style={s.thumb}>
      <View style={s.thumbBox}>{src ? <Image src={src} style={s.thumbImage} /> : <Text style={s.thumbLabel}>{DOC.prescription}</Text>}</View>
      {/* The first layout writes «p. 0», of the same size: the second one doesn't move anything. */}
      <Text style={s.thumbCaption}>{DOC.photoOnPage(page)}</Text>
    </View>
  )
}

/** One medication: what was indicated, its state, one mark per dose and the counts. */
function Medication({ med, consultDate, rule, label }: { med: ExportMedication; consultDate: string; rule: boolean; label: boolean }) {
  const marks = doseMarks(med)
  const record = doseRecord(med)
  return (
    <View style={[s.medication, rule ? s.medicationRule : {}, label ? { paddingTop: 0 } : {}]} wrap={false}>
      {label && <Text style={[s.labelCaps, { marginBottom: px(10) }]}>{DOC.medications}</Text>}
      <View style={s.medicationHead}>
        <Text style={s.medicationName}>{med.name}</Text>
        <Text style={s.medicationLine}>{indication(med, consultDate)}</Text>
        {statusLabels(med).map((label) => (
          <Text key={label.text} style={[s.status, label.strong ? s.statusStrong : s.statusSoft]}>
            {label.text}
          </Text>
        ))}
      </View>
      {marks.length > 0 && (
        <View style={s.marks}>
          {marks.map((letter, i) => (
            <DoseMark key={i} letter={letter} />
          ))}
        </View>
      )}
      <Text style={s.record}>
        {record.lead && <Text style={s.recordLead}>{record.lead}</Text>}
        {(record.lead ? record.rest.map((part) => ` · ${part}`) : [record.rest.join(' · ')]).join('')}
      </Text>
    </View>
  )
}
