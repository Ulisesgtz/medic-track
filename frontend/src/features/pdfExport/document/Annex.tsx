import { Image, Text, View } from '@react-pdf/renderer'
import { DOC } from '../exportText'
import type { PreparedPhotos } from '../photos'
import type { ExportPhotos } from '../types'
import { Marker } from './Marker'
import { day, localDay } from './model'
import type { PageLog } from './pageLog'
import { s } from './styles'

/**
 * «Anexo: fotos» (FR-017): the photos of the paper card, two to a row, then each prescription's, whole, each with what it is. A photo
 * that couldn't be included says so in its place. Each photo writes its page, so a consultation can say «Foto en p. N».
 */
export function Annex({ photos, prepared, log }: { photos: ExportPhotos; prepared: PreparedPhotos; log: PageLog }) {
  const cardRows: ExportPhotos['card'][] = []
  for (let i = 0; i < photos.card.length; i += 2) cardRows.push(photos.card.slice(i, i + 2))
  return (
    <View>
      <Marker log={log} name="section:annex" edge="start" />
      <Text style={s.annexTitle}>{DOC.annexTitle}</Text>
      {cardRows.map((row, r) => (
        <View key={row[0].id} style={s.annexRow} wrap={false}>
          {row.map((photo, i) => (
            <View key={photo.id} style={s.annexHalf}>
              <Photo
                log={log}
                mark={`card:${photo.id}`}
                src={prepared.card[photo.id] ?? null}
                tall
                lead={DOC.cardPhoto(r * 2 + i + 1)}
                rest={[DOC.takenOn(localDay(photo.createdAt))]}
              />
            </View>
          )).flatMap((half, i) => (i === 0 ? [half] : [<View key="gap" style={s.annexGap} />, half]))}
          {row.length === 1 && [<View key="gap" style={s.annexGap} />, <View key="empty" style={s.annexHalf} />]}
        </View>
      ))}
      {photos.consultations.map((photo) => (
        <View key={photo.consultationId} style={s.annexWhole} wrap={false}>
          <Photo
            log={log}
            mark={`consultation:${photo.consultationId}`}
            src={prepared.consultations[photo.consultationId] ?? null}
            lead={DOC.prescriptionPhoto(day(photo.consultDate))}
            rest={[photo.doctorName.trim()].filter(Boolean)}
          />
        </View>
      ))}
      <Marker log={log} name="section:annex" edge="end" />
    </View>
  )
}

function Photo(props: { log: PageLog; mark: string; src: string | null; tall?: boolean; lead: string; rest: string[] }) {
  return (
    <View>
      <Marker log={props.log} name={`photo:${props.mark}`} edge="start" />
      <View style={[s.photoBox, props.tall ? s.photoCard : s.photoPrescription]}>
        {props.src ? <Image src={props.src} style={s.photoImage} /> : <Text style={s.photoMissing}>{DOC.photoNotIncluded}</Text>}
      </View>
      <Text style={s.photoCaption}>
        <Text style={s.photoCaptionLead}>{props.lead}</Text>
        {props.rest.map((part) => ` · ${part}`).join('')}
      </Text>
    </View>
  )
}
