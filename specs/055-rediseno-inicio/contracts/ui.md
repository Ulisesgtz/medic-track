# Contrato de interfaz: Rediseño del inicio (spec 055)

**Sin cambios de API.** El inicio usa los endpoints existentes:

| Uso | Endpoint | Acceso |
|---|---|---|
| Día de un hijo (medicamentos y suplementos) | `GET /children/{childId}/overview?from=&to=` | `seesChild` |
| Actividades de un hijo | `GET /children/{childId}/routines?kind=activity&from=&to=` | `seesChild` |
| «Tu día» | `GET /accounts/{accountId}/routines?kind=supplement\|activity&from=&to=` | `ownsAccount` |
| «Marcar» una toma de medicamento | `PATCH /consultations/{consultationId}/doses/{doseId}` `{ taken }` | `seesConsultation` |
| «Marcar» una toma de suplemento | `PATCH /routines/{routineId}/doses/{doseId}` `{ taken }` | `seesRoutine` |
| «✓ Realizado» | `POST /routines/{routineId}/done` | `seesRoutine` |
| Pantalla «Hoy» del hijo | los `/child-device/*` de la spec 047, sin cambios | credencial del dispositivo |

## Contrato de la pantalla (lo que las pruebas comprueban)

**Orden del inicio** (teléfono y web): aviso «Antes de empezar» (si falta) → nota «Solo lectura» (si aplica) → saludo
(«Hola, {nombre}», fecha, iniciales) → «Tu día» → título de hijos («Tus hijos» / «Hijos compartidos contigo» + subtítulo) →
tarjetas → «+ Agregar hijo» (si `addChildTarget().allowed`) y «Tu plan incluye un hijo» (plan gratuito) → «Lo demás».

**Tarjeta de hijo** (un enlace al detalle y, aparte, el botón «Marcar», que **no** está dentro del enlace):
- encabezado: inicial, nombre, «· edad», chip («N por marcar» ámbar / «sin registrar» punteado) o «✓ Todo marcado hasta
  ahora» (menta) y «›»;
- filas (solo las que tienen algo): Medicamentos / Suplementos / Actividades, icono + título + valor;
- `vacio`: «Hoy no hay tomas ni actividades», sin filas ni pie;
- `sinreg`: borde punteado gris y la línea de la sin registrar;
- pie: «Próxima» + «{nombre} · {HH:MM}» + «Marcar» (44 px, contorno, nombre accesible «Marcar Amoxicilina 16:00 de Mateo»);
  ya marcada: «✓ HH:MM» con `aria-pressed="true"`.

**«Tu día»**: título «Tu día» + «Ver todo» (a `/mis-suplementos`); filas «Mis tomas» (valor, barra `role=progressbar`,
próxima) y «Mis actividades» (valor, próxima, «✓ Realizado» con contorno → «✓ {nombre} · HH:MM»); modos `todo`, `vacio`
(enlace «Agrega tus propios suplementos o actividades»), `plan` (línea con la marca «Plan completo» que abre
`FreemiumLimitModal reason="supplements"`).

**«Lo demás»**: teléfono = filas de 52 px (Familia, Planes, Recordatorios, Cerrar sesión; un Cuidador sin Planes); web =
franja de 4 accesos.

**Un solo botón sólido**: solo «Agregar hijo» en la cuenta sin hijos.

**Pantalla «Hoy» del hijo** (`/hijo/hoy`): «Hola, {nombre}» + fecha + chip; «Tus tomas» («4 hoy · 1 por marcar») por
Mañana / Tarde / Noche; «Tus actividades» («1 de 3 hechas») con «✓ Realizado»; lo de otra persona = texto «✓ por Ana, 08:05»
sin botón; «Avisos» al final; vacío = «Hoy no tienes tomas ni actividades».
