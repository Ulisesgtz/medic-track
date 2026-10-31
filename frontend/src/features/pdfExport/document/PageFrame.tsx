import { Image, Text, View } from '@react-pdf/renderer'
import { DOC } from '../exportText'
import type { PageLog } from './pageLog'
import { s } from './styles'

/** The header and the footer of every page (FR-011): PediTrack and the child, the date and «Página X de Y», and the note. */
export function PageFrame({ name, date, icon, log }: { name: string; date: string; icon: string; log: PageLog }) {
  return (
    <>
      <View style={s.header} fixed>
        <View style={s.brand}>
          <Image src={icon} style={s.logo} />
          <Text style={s.brandName}>{DOC.brand}</Text>
        </View>
        <Text style={s.headerName}>{name}</Text>
      </View>
      {/* The footer is three fixed pieces of the page itself: a dynamic text inside a fixed view is never drawn. */}
      <View style={s.footerRule} fixed />
      <Text
        fixed
        style={s.footerFirst}
        render={({ pageNumber, totalPages }) => {
          log.pages(totalPages)
          return DOC.footerGenerated(date, pageNumber, totalPages)
        }}
      />
      <Text style={s.footerNote} fixed>
        {DOC.footerNote}
      </Text>
    </>
  )
}
