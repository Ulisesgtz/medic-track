# Modelo de datos: Exportar el historial a PDF (spec 050)

**Sin migración.** Todo es lectura de tablas existentes; nada se guarda.

## Pedido de exportación (solo en el cuerpo de la petición)

| Campo | Regla |
|---|---|
| `period.kind` | `all`, `range` o `filters` |
| `period.from`, `period.to` | días; obligatorios con `range`; `from ≤ to` |
| `period.filters` | los campos de la búsqueda del historial (spec 031), validados igual |
| `sections.consultations`, `sections.vaccinations` | al menos una en `true` |
| `sections.photos` | opcional, `false` por omisión |

## Datos del documento (respuesta)

Se arman de:

| Parte | Origen |
|---|---|
| Hijo | `children` (nombre, apellido, nacimiento, talla, peso — sin fecha de anotación) |
| Consultas | `consultation.Repository.Search` con el periodo traducido a criterios (`all` = sin criterios) + el detalle de cada una sin la foto (medicamentos, tomas con estado y autor, extensiones, fin, síntomas) |
| Registro de tomas por medicamento | derivado: marcadas, sin registrar, por venir, total sin canceladas, primera y última toma, última marca (hora y nombre de pila) |
| Próxima cita por consulta y general | `consultation_appointments` en estado `scheduled` del hijo |
| Tratamiento en curso | el de `GetOverview` (el medicamento activo cuya última toma está más adelante) con el doctor de su consulta |
| Vacunas | `vaccination.Repository.List` (todas, con quien corrigió) |
| Fotos (lista) | consultas del periodo con foto (`octet_length(photo) > 0`) y `vaccination.ListPhotos` |

## Documento PDF (solo en el navegador)

- Nombre: `<Nombre>-<Apellido>-historial-<d>-<mes>-<aaaa>.pdf` (día local, mes abreviado en español, sin acentos ni espacios en el nombre).
- Páginas: portada → consultas → cartilla → anexo de fotos, según las secciones; el índice de la portada se calcula después de una primera pasada de armado (las páginas de cada sección).
- No se guarda en el servidor ni en el teléfono salvo que la persona lo descargue o lo comparta.
