import { Path, StyleSheet, Svg, View } from '@react-pdf/renderer'
import type { DoseLetter } from '../types'
import { COLOR, px } from './styles'

// specs/050: the marks the font doesn't have («✓», «→»), drawn. The dose marks differ by SHAPE as well as color, so the record still
// reads printed in black and white (FR-018): marked = filled with a check, unregistered = dashed, ahead = outline. A dose whose time
// came and that nobody has marked yet («por marcar», which the mock doesn't draw) is a solid amber outline: it keeps the app's amber
// and is told apart from the dashed one by its line.

const SIZE = px(16)
const RADIUS = px(4)
const GAP = px(4)

const base = { width: SIZE, height: SIZE, borderRadius: RADIUS, marginRight: GAP, marginBottom: GAP }

const SHAPE = StyleSheet.create({
  t: { ...base, backgroundColor: COLOR.confirmed, alignItems: 'center', justifyContent: 'center' },
  u: { ...base, borderWidth: px(2), borderStyle: 'dashed', borderColor: COLOR.pendingEdge, backgroundColor: COLOR.pendingSoft },
  d: { ...base, borderWidth: px(1.5), borderColor: COLOR.pendingEdge, backgroundColor: COLOR.pendingSoft },
  p: { ...base, borderWidth: px(1.5), borderColor: COLOR.muted },
})

/** One dose of the record. */
export function DoseMark({ letter }: { letter: DoseLetter }) {
  if (letter !== 't') return <View style={SHAPE[letter]} />
  return (
    <View style={SHAPE.t}>
      <Svg width={px(10)} height={px(10)} viewBox="0 0 10 10">
        <Path d="M1.5 5.2 L4 7.6 L8.6 2.6" stroke={COLOR.white} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  )
}

/** «→» after «Continúa en la página N». */
export function Arrow() {
  return (
    <Svg width={px(14)} height={px(14)} viewBox="0 0 14 14">
      <Path d="M2 7 H11.5 M7.5 3 L11.5 7 L7.5 11" stroke={COLOR.action} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
