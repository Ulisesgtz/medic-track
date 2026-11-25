import { LogoMark } from '../Logo.tsx'
import { cn } from '../cn.ts'
import { AppScreen, Check, Chip, MiniButton, Row, Tag } from './parts.tsx'

// Las pantallas de la app dibujadas con el sistema visual, tal cual el mock (decisión 4 y R4 de la spec 080): sin imágenes, y con
// datos de ejemplo, nunca de una familia real. Todo lo que dicen también está en texto en la página donde se usan.

const PHOTO_BARS = ['w-[88%]', 'w-[70%]', 'w-[80%]', 'w-[60%]', 'w-[74%]']

/** «Nueva consulta»: la receta leída en el teléfono y los medicamentos propuestos para revisar. */
export function PrescriptionScreen() {
  return (
    <AppScreen title="Nueva consulta" footer={<MiniButton solid>Guardar consulta</MiniButton>}>
      <div className="flex gap-[5px]">
        <Chip selected>Tos</Chip>
        <Chip selected>Fiebre</Chip>
        <Chip>Garganta</Chip>
      </div>
      <div className="flex h-[116px] flex-col gap-1.5 rounded-xl border border-line bg-surface p-2.5">
        <span className="text-[10px] font-extrabold tracking-[.06em] text-action">FOTO DE LA RECETA</span>
        {PHOTO_BARS.map((width) => (
          <span key={width} className={cn('h-1.5 rounded-[3px] bg-line', width)} />
        ))}
      </div>
      <span className="text-[11px] font-bold text-confirmed">Leída en tu teléfono · revisa antes de guardar</span>
      <Row title="Amoxicilina 250 mg" sub="Cada 8 horas · 7 días" trailing={<MiniButton>Revisar</MiniButton>} />
      <Row title="Paracetamol" sub="Cada 6 horas · 3 días" trailing={<MiniButton>Revisar</MiniButton>} />
    </AppScreen>
  )
}

/** «Hoy»: las tomas del día y el avance del tratamiento. Sirve de «Horario de tomas» y de «Tomas». */
export function DosesScreen() {
  return (
    <AppScreen title="Hoy">
      <Row title="Amoxicilina · 08:00" sub="Mateo · marcada por Ana, 08:05" trailing={<Check />} />
      <Row title="Amoxicilina · 16:00" sub="Mateo · toca ahora" trailing={<MiniButton solid>Marcar</MiniButton>} />
      <Row title="Amoxicilina · 00:00" sub="Mateo · pendiente" />
      <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-2.5 text-xs font-bold">
        <span>Avance del tratamiento</span>
        <span className="block h-2 rounded-[4px] bg-line">
          <span className="block h-2 w-[38%] rounded-[4px] bg-action" />
        </span>
        <span className="text-[11px] font-semibold text-muted">8 de 21 tomas</span>
      </div>
    </AppScreen>
  )
}

function Notice({ time, faded = false, detail }: { time: string; faded?: boolean; detail?: string }) {
  return (
    // El aviso atenuado del mock (opacity .7) dejaba el texto en ~3.4:1: aquí solo se atenúan el logo y la sombra (desviación en desviaciones.md).
    <div className={cn('flex gap-2.5 rounded-2xl border border-line bg-surface p-3', !faded && 'items-start shadow-notice')}>
      <LogoMark size={30} className={faded ? 'opacity-70' : undefined} />
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-bold text-muted">PediTrack · {time}</span>
        <span className="text-[13px] font-extrabold">Toca Amoxicilina · Mateo</span>
        {detail && <span className="text-xs text-body">{detail}</span>}
      </div>
    </div>
  )
}

/** «Recordatorio»: el aviso en el teléfono a la hora de cada toma. */
export function ReminderScreen() {
  return (
    <AppScreen title="Recordatorio">
      <div className="mt-5 flex flex-col gap-2.5">
        <Notice time="16:00" detail="5 ml · segunda toma de hoy" />
        <Notice time="08:00" faded />
      </div>
    </AppScreen>
  )
}

/** «Cartilla»: vacunas anotadas a mano y la foto de la cartilla de papel. */
export function VaccineCardScreen() {
  const noted = [
    ['BCG · al nacer', 'Anotada · 14 jun 2026'],
    ['Hepatitis B · 2 meses', 'Anotada · 14 jun 2026'],
    ['Rotavirus · 4 meses', 'Anotada · 14 jun 2026'],
  ]
  return (
    <AppScreen title="Cartilla">
      {noted.map(([title, sub]) => (
        <Row key={title} title={title} sub={sub} trailing={<Check />} />
      ))}
      <Row title="Neumocócica · 6 meses" sub="Por anotar" trailing={<MiniButton>Anotar</MiniButton>} />
      <div className="flex h-[70px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-hint-border text-xs font-bold text-action">
        Foto de la cartilla de papel
      </div>
    </AppScreen>
  )
}

/** «Botiquín»: lo que hay en casa, con su caducidad como un dato más. */
export function CabinetScreen() {
  return (
    <AppScreen title="Botiquín">
      <Row title="Paracetamol gotas" sub="Caduca ene 2027" trailing={<MiniButton>Foto</MiniButton>} />
      <Row title="Suero oral" sub="Caduca mar 2027" trailing={<MiniButton>Foto</MiniButton>} />
      <Row title="Termómetro" sub="Sin caducidad" />
      <Row title="Ibuprofeno jarabe" sub="Caduca dic 2026" trailing={<Tag>Pronto</Tag>} />
    </AppScreen>
  )
}

/** «Familia»: quién ve y marca las tomas, y el teléfono del hijo. */
export function FamilyScreen() {
  return (
    <AppScreen title="Familia" footer={<MiniButton>Invitar a alguien</MiniButton>}>
      <Row title="Ana" sub="Tutora · marcó 08:05" trailing={<Tag>Tutor</Tag>} />
      <Row title="Luis" sub="Tutor · marcó 16:02" trailing={<Tag>Tutor</Tag>} />
      <Row title="Abuela Rosa" sub="Cuidadora · recibe avisos" trailing={<Tag>Cuidador</Tag>} />
      <Row title="Mateo" sub="Su teléfono · ve las tomas de hoy" trailing={<MiniButton>Ver</MiniButton>} />
      <div className="text-xs font-semibold text-muted">3 de 4 lugares usados</div>
    </AppScreen>
  )
}

/** El historial de un hijo en computadora, con filtros y «Exportar a PDF». */
export function DesktopScreen() {
  const history = [
    ['Consulta · Dra. Pérez', '14 sep 2026 · Receta con 2 medicamentos'],
    ['Vacuna anotada', '02 jun 2026 · Neumocócica'],
    ['Consulta · Dra. Pérez', '18 mar 2026 · Receta con 1 medicamento'],
    ['Medida de crecimiento', '12 oct 2025 · 11.4 kg · 82 cm'],
  ]
  return (
    <div className="flex h-[400px] w-[640px] overflow-hidden rounded-[14px] border border-line bg-canvas shadow-frame-desktop">
      <div className="flex w-[150px] flex-col gap-2 bg-ink px-3 py-4 text-xs font-bold text-hint-border">
        <span className="mb-2 text-sm font-black text-surface">PediTrack</span>
        <span>Inicio</span>
        <span className="rounded-lg bg-ink-soft px-2 py-1.5 text-surface">Mateo</span>
        <span>Sofía</span>
        <span className="mt-2">Botiquín</span>
        <span>Mi día</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-[18px]">
        <span className="text-xl font-black text-ink">Historial de Mateo</span>
        <div className="flex gap-1.5">
          <Chip selected>Todo</Chip>
          <Chip>Consultas</Chip>
          <Chip>Tomas</Chip>
          <Chip>Vacunas</Chip>
        </div>
        {history.map(([title, sub]) => (
          <Row key={`${title}${sub}`} title={title} sub={sub} />
        ))}
        <div className="mt-auto flex justify-end">
          <MiniButton>Exportar a PDF</MiniButton>
        </div>
      </div>
    </div>
  )
}
