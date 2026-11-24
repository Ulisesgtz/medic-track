import { render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button.tsx'
import { Card } from './Card.tsx'
import { Logo, LogoMark } from './Logo.tsx'
import { DesktopFrame, PhoneFrame, ScreenCrop } from './PhoneFrame.tsx'
import { PlanTable } from './PlanTable.tsx'
import { SectionHeading } from './SectionHeading.tsx'
import { cn } from './cn.ts'
import { AppScreen, Check, Chip, MiniButton, Row, Tag } from './screens/parts.tsx'
import {
  ReminderScreen,
  CabinetScreen,
  VaccineCardScreen,
  DesktopScreen,
  FamilyScreen,
  PrescriptionScreen,
  DosesScreen,
} from './screens/screens.tsx'

describe('cn', () => {
  it('une solo lo que es texto', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
})

describe('Logo', () => {
  it('el enlace dice PediTrack y lleva a su página', () => {
    render(<Logo href="/" />)
    expect(screen.getByRole('link', { name: 'PediTrack' })).toHaveAttribute('href', '/')
  })

  it('la cápsula es decorativa, sin clipPath ni ids que se repitan', () => {
    const { container } = render(
      <>
        <LogoMark />
        <LogoMark onDark size={38} />
      </>,
    )
    const svgs = container.querySelectorAll('svg')
    expect(svgs).toHaveLength(2)
    for (const svg of svgs) expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[id]')).toBeNull()
    expect(container.querySelector('clipPath')).toBeNull()
    expect(svgs[1]).toHaveAttribute('width', '38')
  })

  it('sobre fondo oscuro y en tamaño grande usa las clases del pie', () => {
    const { container } = render(<Logo href="/" onDark large />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('web:size-[38px]')
    expect(container.querySelector('rect')?.getAttribute('class')).toContain('fill-bright')
  })
})

describe('Button', () => {
  it('es siempre un enlace real, de 44 px o más de alto', () => {
    render(
      <>
        <Button href="/a">Sólido</Button>
        <Button href="/b" variant="outline" block>
          Borde
        </Button>
        <Button href="/c" variant="link">
          Enlace
        </Button>
      </>,
    )
    expect(screen.getByRole('link', { name: 'Sólido' }).className).toMatch(/min-h-\[52px\]/)
    expect(screen.getByRole('link', { name: 'Borde' }).className).toMatch(/min-h-12/)
    expect(screen.getByRole('link', { name: 'Borde' }).className).toContain('w-full')
    expect(screen.getByRole('link', { name: 'Enlace' }).className).toMatch(/min-h-11/)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Card y SectionHeading', () => {
  it('la tarjeta marcada lleva borde de 2 px', () => {
    const { container } = render(
      <>
        <Card>normal</Card>
        <Card as="article" id="x" highlighted>
          marcada
        </Card>
      </>,
    )
    expect(container.querySelector('div')?.className).toContain('border-line')
    const marked = container.querySelector('article#x')
    expect(marked?.className).toContain('border-2')
  })

  it('el encabezado de sección: rótulo, título y apoyo; h1 solo si se pide', () => {
    render(
      <>
        <SectionHeading eyebrow="Planes" title="Título uno" lead="Apoyo" />
        <SectionHeading eyebrow="Otra" title="Título dos" as="h1" onDark />
      </>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Título uno' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Título dos' }).className).toContain('text-surface')
    expect(screen.getByText('Apoyo')).toBeInTheDocument()
    expect(screen.getByText('Planes').tagName).toBe('SPAN')
  })

  it('con fondo oscuro el apoyo va en el tono claro', () => {
    render(<SectionHeading eyebrow="Privacidad" title="T" lead="apoyo oscuro" onDark />)
    expect(screen.getByText('apoyo oscuro').className).toContain('text-hint-edge')
  })
})

describe('PhoneFrame, DesktopFrame y ScreenCrop', () => {
  it('cada dibujo es una imagen con su etiqueta y reserva su tamaño escalado', () => {
    render(
      <>
        <PhoneFrame label="Captura del teléfono" scale="[--s:0.9]">
          <span>a</span>
        </PhoneFrame>
        <DesktopFrame label="Captura de computadora" scale="[--s:0.54]">
          <span>b</span>
        </DesktopFrame>
        <ScreenCrop label="Detalle" className="h-[190px]">
          <span>c</span>
        </ScreenCrop>
      </>,
    )
    const phone = screen.getByRole('img', { name: 'Captura del teléfono' })
    expect(phone.className).toContain('w-[calc(296px*var(--s))]')
    expect(phone.className).toContain('[--s:0.9]')
    expect(screen.getByRole('img', { name: 'Captura de computadora' }).className).toContain('h-[calc(400px*var(--s))]')
    expect(screen.getByRole('img', { name: 'Detalle' }).className).toContain('h-[190px]')
  })
})

describe('PlanTable', () => {
  const rows = [
    { feature: 'Hijos registrados', free: '1', full: 'Hasta 10' },
    { feature: 'Consultas con receta', free: 'included' as const, full: 'included' as const },
    { feature: 'Gráfica de crecimiento', free: 'excluded' as const, full: 'included' as const },
  ]

  it('es una tabla real con encabezados de columna y de fila', () => {
    render(<PlanTable rows={rows} />)
    const table = screen.getByRole('table', { name: 'Comparación de planes' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Función', 'Gratis', 'Plan completo'])
    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(rows.map((row) => row.feature))
    expect(within(table).getAllByRole('row')).toHaveLength(4)
  })

  it('«Incluido» y «No incluido» llevan icono y texto, y la etiqueta accesible', () => {
    render(<PlanTable rows={rows} label="Otra tabla" />)
    const table = screen.getByRole('table', { name: 'Otra tabla' })
    const included = within(table).getAllByRole('cell', { name: 'Incluido' })
    const excluded = within(table).getAllByRole('cell', { name: 'No incluido' })
    expect(included).toHaveLength(3)
    expect(excluded).toHaveLength(1)
    expect(excluded[0].querySelector('svg')).not.toBeNull()
    expect(excluded[0]).toHaveTextContent('No incluido')
    expect(within(table).getByRole('cell', { name: '1' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'Hasta 10' })).toBeInTheDocument()
  })
})

describe('pantallas dibujadas', () => {
  it('cada una tiene su título y los textos de ejemplo del diseño', () => {
    const cases: Array<[ReactElement, string[]]> = [
      [<PrescriptionScreen />, ['Nueva consulta', 'Amoxicilina 250 mg', 'Guardar consulta', 'Leída en tu teléfono · revisa antes de guardar']],
      [<DosesScreen />, ['Hoy', 'Mateo · marcada por Ana, 08:05', '8 de 21 tomas']],
      [<ReminderScreen />, ['Recordatorio', '5 ml · segunda toma de hoy']],
      [<VaccineCardScreen />, ['Cartilla', 'BCG · al nacer', 'Foto de la cartilla de papel']],
      [<CabinetScreen />, ['Botiquín', 'Caduca ene 2027', 'Sin caducidad']],
      [<FamilyScreen />, ['Familia', 'Abuela Rosa', '3 de 4 lugares usados']],
      [<DesktopScreen />, ['Historial de Mateo', 'Exportar a PDF', 'Medida de crecimiento']],
    ]
    for (const [element, texts] of cases) {
      const { unmount } = render(element)
      for (const text of texts) expect(screen.getAllByText(text).length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('las piezas se dibujan', () => {
    render(
      <AppScreen title="Prueba" footer={<span>pie</span>}>
        <Row title="Fila" sub="sub" trailing={<Check />} />
        <Chip selected>sí</Chip>
        <Chip>no</Chip>
        <MiniButton solid>sólido</MiniButton>
        <Tag>etiqueta</Tag>
      </AppScreen>,
    )
    expect(screen.getByText('Prueba')).toBeInTheDocument()
    expect(screen.getByText('pie')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('sí').className).toContain('bg-hint')
  })
})
