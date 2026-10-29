// Drawings of steps 2 to 5 that put PediTrack on an iPhone's home screen (InstallSteps). They are simple sketches of what the child
// sees — not screenshots — and only help the words: each one is hidden from screen readers, the step's text says it all. The part to
// press is drawn in action with a bright ring.

const frame = 'fill-hint stroke-hint-border'
const label = 'fill-body text-[11px] font-semibold'
const strong = 'fill-ink text-[12px] font-extrabold'

function Art({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 280 140" aria-hidden="true" focusable="false" className="h-auto w-full">
      <rect x="1" y="1" width="278" height="138" rx="18" strokeWidth="2" className={frame} />
      {children}
    </svg>
  )
}

/** The ring around what to press. */
function Ring({ x, y, w, h, r = 12 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={r + 5} fill="none" strokeWidth="3" className="stroke-bright" />
}

/** The share button: a little box with an arrow up. */
function ShareGlyph({ x, y, className }: { x: number; y: number; className: string }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 9 H2 V22 H18 V9 H15" />
      <path d="M10 2 V15 M6 6 L10 2 L14 6" />
    </g>
  )
}

export function MenuArt() {
  return (
    <Art>
      <text x="140" y="34" textAnchor="middle" className={label}>
        En Safari
      </text>
      <rect x="18" y="56" width="244" height="56" rx="16" className="fill-surface" />
      <rect x="30" y="70" width="150" height="28" rx="14" className="fill-hint" />
      <text x="105" y="88" textAnchor="middle" className={label}>
        pedi-track.com
      </text>
      <Ring x={192} y={70} w={28} h={28} r={14} />
      <circle cx="206" cy="84" r="14" className="fill-action" />
      {[199, 206, 213].map((cx) => (
        <circle key={cx} cx={cx} cy="84" r="2.2" className="fill-surface" />
      ))}
      <ShareGlyph x={230} y={72} className="stroke-action" />
    </Art>
  )
}

export function AddToHomeArt() {
  const rows = ['Copiar', 'Agregar a favoritos']
  return (
    <Art>
      <rect x="22" y="14" width="236" height="112" rx="16" className="fill-surface" />
      {rows.map((text, i) => (
        <g key={text}>
          <text x="40" y={40 + i * 28} className={label}>
            {text}
          </text>
          <line x1="36" x2="244" y1={50 + i * 28} y2={50 + i * 28} strokeWidth="1" className="stroke-hint-border" />
        </g>
      ))}
      <Ring x={30} y={88} w={220} h={28} r={10} />
      <rect x="30" y="88" width="220" height="28" rx="10" className="fill-hint" />
      <text x="40" y="107" className={strong}>
        Agregar a pantalla de inicio
      </text>
      <g transform="translate(220 92)" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-action">
        <rect x="1" y="1" width="18" height="18" rx="5" />
        <path d="M10 5 V15 M5 10 H15" />
      </g>
    </Art>
  )
}

export function ConfirmArt() {
  return (
    <Art>
      <rect x="22" y="14" width="236" height="112" rx="16" className="fill-surface" />
      <text x="40" y="38" className={label}>
        Cancelar
      </text>
      <Ring x={196} y={24} w={48} h={20} r={8} />
      <text x="240" y="38" textAnchor="end" className="fill-action text-[12px] font-extrabold">
        Agregar
      </text>
      <image href="/icon-192.png" x="40" y="54" width="30" height="30" />
      <text x="80" y="74" className={strong}>
        PediTrack
      </text>
      <text x="40" y="111" className={label}>
        Abrir como app web
      </text>
      <rect x="206" y="96" width="38" height="22" rx="11" className="fill-confirmed" />
      <circle cx="233" cy="107" r="9" className="fill-surface" />
    </Art>
  )
}

export function OpenArt() {
  const apps = [40, 92, 144]
  return (
    <Art>
      {apps.map((x) => (
        <rect key={x} x={x} y="26" width="40" height="40" rx="11" className="fill-hint-border" />
      ))}
      <Ring x={196} y={26} w={40} h={40} r={11} />
      <image href="/icon-192.png" x="196" y="26" width="40" height="40" />
      <text x="216" y="82" textAnchor="middle" className="fill-ink text-[10px] font-bold">
        PediTrack
      </text>
      <rect x="70" y="96" width="140" height="32" rx="12" className="fill-confirmed" />
      <text x="140" y="117" textAnchor="middle" className="fill-surface text-[13px] font-extrabold">
        Pegar mi liga
      </text>
    </Art>
  )
}
