import { StyleSheet } from '@react-pdf/renderer'
import { FONT_FAMILY, FONT_FAMILY_EXT } from './fonts'

// specs/050: the document's measures, taken from the mock (Exportar PDF - Documento.dc.html), which draws a Letter page at 96 ppi
// (816 × 1056 px). The PDF measures in points (72 per inch), so every px of the mock is `px(n)` = n × 0.75 pt.
// The colors are the mock's own ink on white (this file draws a PDF, not the app: the app's tokens don't reach it).

export const px = (n: number) => n * 0.75

export const COLOR = {
  ink: '#04252b',
  body: '#1f3d44',
  action: '#0e7490',
  rule: '#cbd5e1',
  hairline: '#e2e8f0',
  photoBack: '#f1f5f9',
  muted: '#94a3b8',
  placeholder: '#475569',
  confirmed: '#047857',
  pendingEdge: '#f59e0b',
  pendingSoft: '#fef3c7',
  white: '#ffffff',
} as const

/** Page margins of the mock: 68 px at the sides, 44 px at the top and 36 px at the bottom. */
export const MARGIN = { side: px(68), top: px(44), bottom: px(36) } as const

/** The header: a 24 px logo, 12 px under it and a 1 px rule. The content starts 24 px below it (36 px on the cover). */
export const HEADER_HEIGHT = px(24 + 12 + 1)
/** The footer: a 1 px rule, 10 px, and two lines of 12.5 px at 1.45 with 3 px between them. */
export const FOOTER_HEIGHT = px(1 + 10 + 12.5 * 1.45 * 2 + 3)

/** The height of a Letter page, in points. */
const LETTER_HEIGHT = 792

/** The room the consultations' pages keep over the footer for «Continúa en la página N →», and where that line starts. */
const CONTINUES_ROOM = 22
const CONTINUES_TOP = LETTER_HEIGHT - MARGIN.bottom - FOOTER_HEIGHT - px(8 + CONTINUES_ROOM)

/** One line of the footer, placed from the page's bottom. */
const footerLine = {
  position: 'absolute' as const,
  left: MARGIN.side,
  right: MARGIN.side,
  fontSize: px(12.5),
  color: COLOR.body,
}

const caps = (size: number, spacing: number) => ({
  fontSize: px(size),
  fontWeight: 800,
  letterSpacing: px(size * spacing),
  textTransform: 'uppercase' as const,
})

export const s = StyleSheet.create({
  page: {
    fontFamily: [FONT_FAMILY, FONT_FAMILY_EXT],
    color: COLOR.ink,
    backgroundColor: COLOR.white,
    paddingTop: MARGIN.top + HEADER_HEIGHT + px(24),
    paddingBottom: MARGIN.bottom + FOOTER_HEIGHT + px(12),
    paddingHorizontal: MARGIN.side,
  },
  header: {
    position: 'absolute',
    top: MARGIN.top,
    left: MARGIN.side,
    right: MARGIN.side,
    paddingBottom: px(12),
    borderBottomWidth: px(1),
    borderBottomColor: COLOR.rule,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: px(24), height: px(24), borderRadius: px(6), marginRight: px(8) },
  brandName: { fontSize: px(16), fontWeight: 800, letterSpacing: px(16 * -0.03) },
  headerName: { fontSize: px(15), fontWeight: 800 },
  footerRule: {
    position: 'absolute',
    bottom: MARGIN.bottom + FOOTER_HEIGHT - px(1),
    left: MARGIN.side,
    right: MARGIN.side,
    borderTopWidth: px(1),
    borderTopColor: COLOR.rule,
  },
  // A dynamic text with a lineHeight is never drawn by the library (checked with 4.9.0), so the first line goes without one and
  // the 1.45 of the mock is made up by where it sits.
  footerFirst: { ...footerLine, bottom: MARGIN.bottom + px(12.5 * 1.45 + 3 + (12.5 * 0.45) / 2), fontWeight: 700 },
  footerNote: { ...footerLine, lineHeight: 1.45, bottom: MARGIN.bottom },

  // The cover.
  cover: { paddingTop: px(12) },
  coverBlock: { marginBottom: px(30) },
  eyebrow: { ...caps(13, 0.12), color: COLOR.action },
  coverTitle: { fontSize: px(42), fontWeight: 900, letterSpacing: px(42 * -0.03), marginTop: px(6) },
  facts: { flexDirection: 'row', borderTopWidth: px(2), borderTopColor: COLOR.ink, borderBottomWidth: px(1), borderBottomColor: COLOR.rule },
  fact: { flex: 1, paddingVertical: px(14), paddingHorizontal: px(12), borderLeftWidth: px(1), borderLeftColor: COLOR.rule },
  factFirst: { flex: 1, paddingVertical: px(14), paddingRight: px(12) },
  factLabel: { fontSize: px(13), fontWeight: 700, color: COLOR.body, marginBottom: px(4) },
  factValue: { fontSize: px(17), fontWeight: 800 },
  includesRows: { marginTop: px(12) },
  includesRow: { flexDirection: 'row', fontSize: px(15), lineHeight: 1.5, marginBottom: px(8) },
  includesLabel: { width: px(150), marginRight: px(16), fontWeight: 700, color: COLOR.body },
  includesValue: { flex: 1 },
  count: {
    marginTop: px(6),
    paddingVertical: px(14),
    borderTopWidth: px(1),
    borderTopColor: COLOR.rule,
    borderBottomWidth: px(1),
    borderBottomColor: COLOR.rule,
    fontSize: px(19),
    fontWeight: 800,
    letterSpacing: px(19 * -0.01),
  },
  boxes: { flexDirection: 'row' },
  box: { flex: 1, paddingVertical: px(16), paddingHorizontal: px(18), borderRadius: px(12), borderWidth: px(1.5) },
  boxGap: { width: px(16) },
  boxEyebrow: { ...caps(13, 0.1), color: COLOR.action, marginBottom: px(6) },
  boxValue: { fontSize: px(18), fontWeight: 800, marginBottom: px(6) },
  boxLine: { fontSize: px(15), lineHeight: 1.5, marginBottom: px(6) },
  boxSmall: { fontSize: px(14), color: COLOR.body },
  emptyBox: { paddingVertical: px(16), paddingHorizontal: px(18), borderWidth: px(1), borderStyle: 'dashed', borderColor: COLOR.muted, borderRadius: px(12) },
  emptyTitle: { fontSize: px(16), fontWeight: 800, marginBottom: px(4) },
  emptyText: { fontSize: px(15), lineHeight: 1.5, color: COLOR.body },
  contentsRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: px(15), marginTop: px(6) },
  contentsPage: { fontWeight: 700, marginLeft: px(16) },

  // A section.
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: px(18) },
  sectionTitle: { fontSize: px(26), fontWeight: 900, letterSpacing: px(26 * -0.02) },
  sectionCount: { fontSize: px(14), color: COLOR.body },

  // A consultation.
  consultation: { marginBottom: px(18) },
  consultationRule: { borderTopWidth: px(2), borderTopColor: COLOR.ink, marginBottom: px(14) },
  consultationHead: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: px(12) },
  consultationDate: { fontSize: px(22), fontWeight: 900, letterSpacing: px(22 * -0.02), marginRight: px(12) },
  consultationDoctor: { fontSize: px(16), fontWeight: 700, marginRight: px(12) },
  // The «continúa» lines of a consultation that crosses a page: in the gap under the header and over the footer (Consultations.tsx).
  consultationsPage: { paddingBottom: MARGIN.bottom + FOOTER_HEIGHT + px(12 + CONTINUES_ROOM) },
  continuedLine: {
    position: 'absolute',
    top: MARGIN.top + HEADER_HEIGHT + px(6),
    left: MARGIN.side,
    right: MARGIN.side,
    fontSize: px(13),
    fontWeight: 700,
    color: COLOR.body,
  },
  // «Continúa en la página N» and its arrow, at the right over the footer. Anchored by their top: a dynamic piece anchored by its
  // bottom is placed as if it had no height (checked with 4.9.0).
  continuesText: {
    position: 'absolute',
    top: CONTINUES_TOP,
    left: MARGIN.side,
    right: MARGIN.side + px(14 + 4),
    textAlign: 'right',
    fontSize: px(14),
    fontWeight: 700,
    color: COLOR.action,
  },
  continuesArrow: { position: 'absolute', top: CONTINUES_TOP + px(1), right: MARGIN.side, width: px(14), height: px(14) },
  labelCaps: { ...caps(12.5, 0.08), color: COLOR.body },
  part: { marginBottom: px(12) },
  symptoms: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: px(12) },
  symptomsLabel: { ...caps(12.5, 0.08), color: COLOR.body, marginRight: px(12) },
  pill: { paddingVertical: px(2), paddingHorizontal: px(10), borderWidth: px(1), borderColor: COLOR.ink, borderRadius: px(999), fontSize: px(14), fontWeight: 700, marginRight: px(8), marginBottom: px(4) },
  notes: { fontSize: px(15), lineHeight: 1.55, marginTop: px(4) },
  plainLine: { fontSize: px(14), color: COLOR.body, marginBottom: px(12) },
  medication: { paddingVertical: px(10) },
  medicationRule: { borderBottomWidth: px(1), borderBottomColor: COLOR.hairline },
  medicationHead: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: px(8) },
  medicationName: { fontSize: px(16), fontWeight: 800, marginRight: px(10) },
  medicationLine: { fontSize: px(14), marginRight: px(10) },
  status: { paddingVertical: px(1), paddingHorizontal: px(8), borderWidth: px(1), borderRadius: px(999), fontSize: px(12.5), fontWeight: 800, marginRight: px(6) },
  statusStrong: { borderColor: COLOR.ink },
  statusSoft: { borderColor: COLOR.muted, color: COLOR.body },
  marks: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: px(460), marginBottom: px(4) },
  record: { fontSize: px(14), marginTop: px(4) },
  recordLead: { fontWeight: 800 },
  appointment: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', paddingVertical: px(10), paddingHorizontal: px(14), borderWidth: px(1), borderColor: COLOR.rule, borderRadius: px(10), marginTop: px(2) },
  appointmentLabel: { ...caps(12.5, 0.08), color: COLOR.body, marginRight: px(12) },
  appointmentText: { fontSize: px(15), flex: 1 },

  // The vaccination card.
  tableHead: { flexDirection: 'row', paddingVertical: px(8), borderBottomWidth: px(2), borderBottomColor: COLOR.ink, ...caps(12.5, 0.06), color: COLOR.body },
  groupHead: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: px(12), paddingBottom: px(4) },
  groupName: { fontSize: px(16), fontWeight: 900, marginRight: px(10) },
  groupNote: { fontSize: px(13), color: COLOR.body },
  row: { flexDirection: 'row', paddingVertical: px(7), borderBottomWidth: px(1), borderBottomColor: COLOR.hairline, fontSize: px(14), lineHeight: 1.4 },
  colDose: { width: px(70), marginRight: px(12), fontWeight: 700 },
  colDate: { width: px(104), marginRight: px(12) },
  colLot: { width: px(88), marginRight: px(12) },
  colPlace: { flex: 1, marginRight: px(12) },
  colNote: { width: px(150) },
  corrected: { fontSize: px(12.5), fontStyle: 'italic', color: COLOR.body, marginTop: px(2) },

  // The prescription's thumbnail beside a consultation's head, and the annex.
  consultationTop: { flexDirection: 'row', justifyContent: 'space-between' },
  consultationTopMain: { flex: 1, marginRight: px(20) },
  thumb: { alignItems: 'center' },
  thumbBox: {
    width: px(84),
    height: px(104),
    borderWidth: px(1),
    borderColor: COLOR.muted,
    borderRadius: px(6),
    backgroundColor: COLOR.photoBack,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: px(84), height: px(104), objectFit: 'cover' },
  thumbLabel: { fontSize: px(11), fontWeight: 700, color: COLOR.placeholder, textAlign: 'center' },
  thumbCaption: { fontSize: px(12.5), color: COLOR.body, marginTop: px(4) },
  annexTitle: { fontSize: px(26), fontWeight: 900, letterSpacing: px(26 * -0.02), marginBottom: px(16) },
  annexRow: { flexDirection: 'row', marginBottom: px(16) },
  annexHalf: { flex: 1 },
  annexGap: { width: px(16) },
  annexWhole: { marginBottom: px(16) },
  photoBox: {
    borderWidth: px(1),
    borderColor: COLOR.muted,
    borderRadius: px(8),
    backgroundColor: COLOR.photoBack,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: px(6),
  },
  photoCard: { height: px(420) },
  photoPrescription: { height: px(290) },
  photoImage: { width: '100%', height: '100%', objectFit: 'contain' },
  photoMissing: { fontSize: px(13), fontWeight: 700, color: COLOR.placeholder, textAlign: 'center', paddingHorizontal: px(12) },
  photoCaption: { fontSize: px(14), lineHeight: 1.4 },
  photoCaptionLead: { fontWeight: 800 },
})
