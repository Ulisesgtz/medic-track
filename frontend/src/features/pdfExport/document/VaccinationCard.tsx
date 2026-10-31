import { Text, View } from '@react-pdf/renderer'
import { DOC } from '../exportText'
import type { ExportVaccination } from '../types'
import { Marker } from './Marker'
import { vaccineGroups, vaccineRow } from './model'
import type { PageLog } from './pageLog'
import { s } from './styles'

/**
 * «Cartilla de vacunación» (FR-016): every recorded dose whatever the period, by vaccine, with its dose, date, lot, place and note,
 * who corrected it, and «Nombre escrito por la familia» for a name outside the catalog. The table's head repeats on every page.
 */
export function VaccinationCard({ vaccinations, log }: { vaccinations: ExportVaccination[]; log: PageLog }) {
  return (
    <View>
      <Marker log={log} name="section:card" edge="start" />
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{DOC.cardTitle}</Text>
        <Text style={s.sectionCount}>{DOC.cardCount(vaccinations.length)}</Text>
      </View>
      <View style={s.tableHead} fixed>
        {DOC.columns.map((column, i) => (
          <Text key={column} style={[s.colDose, s.colDate, s.colLot, s.colPlace, s.colNote][i]}>
            {column}
          </Text>
        ))}
      </View>
      {vaccineGroups(vaccinations).map((group) => (
        <View key={`${group.custom}:${group.name}`}>
          <View style={s.groupHead} minPresenceAhead={40}>
            <Text style={s.groupName}>{group.name}</Text>
            {group.custom && <Text style={s.groupNote}>{DOC.familyName}</Text>}
          </View>
          {group.doses.map((dose) => {
            const row = vaccineRow(dose)
            return (
              <View key={dose.id} style={s.row} wrap={false}>
                <Text style={s.colDose}>{row.dose}</Text>
                <Text style={s.colDate}>{row.date}</Text>
                <Text style={s.colLot}>{row.lot}</Text>
                <Text style={s.colPlace}>{row.place}</Text>
                <View style={s.colNote}>
                  <Text>{row.note}</Text>
                  {row.corrected && <Text style={s.corrected}>{row.corrected}</Text>}
                </View>
              </View>
            )
          })}
        </View>
      ))}
      <Marker log={log} name="section:card" edge="end" />
    </View>
  )
}
