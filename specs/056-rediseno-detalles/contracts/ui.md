# Contrato de interfaz: Rediseño de las pantallas de detalle (spec 056)

**Sin cambios de API.** Las pantallas usan los endpoints que ya existen (research R1).

## Rutas

| Ruta | Antes | Después |
|---|---|---|
| `/mi-dia` | — | «Mi día» (nueva) |
| `/mis-suplementos` | Mis suplementos | redirige a `/mi-dia#suplementos` |
| `/mis-actividades` | Mis actividades | redirige a `/mi-dia#actividades` |
| `/mis-suplementos/nueva`, `/mis-actividades/nueva`, `/suplementos/:id`, `/actividades/:id` | igual | igual; su «← …» de una rutina personal dice «← Mi día» |

## `PageHeader` (lo que las pruebas comprueban)

- Un `<header>`; «← {label}» es un enlace de 44 px; el título es el único `<h1>` de la pantalla.
- Teléfono: sin fondo tinta; acciones bajo el título. Web: acciones a la derecha.
- `state="loading"`: «← …» funciona y hay un esqueleto (`role=status`, «Cargando»). `state="error"`: `role=alert` con
  «Reintentar».
- `readOnly`: la nota «Solo lectura…» del inicio.
- `search`: el campo queda dentro del encabezado y se pega arriba al hacer scroll (teléfono).

## `StickyActionBar`

En el teléfono el botón de guardar de un formulario está en una barra al final del `<form>`, pegada abajo (`sticky`); en la
web el botón va al final del formulario sin barra. Un solo botón sólido.

## Detalle del hijo

Orden: `PageHeader` → «Hoy» (`region` «Hoy») → tratamiento activo → próxima cita → `nav` «Secciones» (Consultas,
Suplementos, Actividades, Cartilla: solo las que existen) → secciones con `id` → «Lo demás» (Acceso del hijo, Familia que lo
ve). «Nueva consulta» es el único sólido (fijo abajo en el teléfono). Sin «Consultas: N desde …».

## Detalle de la consulta

Orden: `PageHeader` (fecha, doctor, «Solo registro», «Editada el … por …», «Editar consulta» con contorno) → tratamiento
(calendario: semana en el teléfono con «Ver mes», mes en la web; tarjetas de medicamento con las tomas del día elegido) →
próxima cita → «Datos de la consulta» (`<details>` cerrado en el teléfono con su resumen, abierto en la web y en «solo
registro»). Chip ajeno: botón deshabilitado con candado y «por Nombre». «programada» se puede marcar.

## «Mi día»

`PageHeader` H5 → «Hoy» → `nav` «Secciones» (Suplementos, Actividades) → `MisRegistroSeccion` de cada tipo. Sin nada creado:
«Agregar mi primer suplemento» sólido dentro de «Hoy» y la actividad con contorno.
