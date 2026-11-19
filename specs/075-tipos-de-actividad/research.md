# Investigación — Spec 075: Tipos de actividad

Fecha: 2026-11-19. Hechos del código leídos por `Explore` (Haiku); decisiones de la sesión principal.

## R1. El catálogo: una tabla como `vaccine_catalog` y `symptoms`

**Hallazgo**: `symptoms` (0012) y `vaccine_catalog` (0028) son tablas `code` PK, `name`, `sort_order UNIQUE`, `active
BOOLEAN DEFAULT true`, servidas públicas por `internal/catalog` (`GET /catalog/symptoms`, `GET /catalog/vaccines`,
`router.go:143-144`, `WHERE active ORDER BY sort_order`), sin caché en el servidor; el frontend las pide con
`shared/catalog/useCatalog.ts` (staleTime 10 min).

**Decisión**: tabla `activity_types` con la misma forma y `GET /catalog/activity-types` en `internal/catalog` (público,
`WHERE active ORDER BY sort_order`). Seis filas: `school` Escolar (10), `sports` Deportiva (20), `arts` Artística y
cultural (30), `therapy` Terapia y seguimiento (40), `habits` Hábitos y cuidado diario (50), `other` Otra (60). Retirar =
`active = false`; agregar = un `INSERT` con su `sort_order`.

**Alternativas descartadas**: un enum de Postgres o constantes en Go (ampliar pediría publicar la app, contra la spec).

## R2. El tipo en la actividad

**Decisión**: columna `supplement_routines.activity_type TEXT NULL REFERENCES activity_types (code)` (FK sin `ON
DELETE`: un tipo no se borra, se retira) y `CHECK ((kind = 'activity') = (activity_type IS NOT NULL))`: toda actividad
tiene tipo, ningún suplemento. La migración `0041` agrega la columna, rellena `habits` en las actividades existentes y
después crea el CHECK.

Para mostrar los segmentos de un tipo **retirado** (caso límite), la respuesta de la actividad trae el **código** y el
frontend busca su nombre en un catálogo que incluye los retirados: `GET /catalog/activity-types` devuelve todos con
`active` (el formulario solo ofrece los activos; los segmentos usan todos). Así un tipo retirado conserva su nombre y su
lugar.

## R3. Crear: obligatorio

`createRoutineRequest` (`handler.go:96-111`) gana `activityType`. `validateInput` (`validate.go:31-104`): con `kind =
activity`, `activityType` obligatorio y **activo** en el catálogo (400 con el campo `activityType`); con `kind =
supplement`, debe venir vacío (400 si viene). La existencia se revisa contra la tabla en la transacción de `Create`
(un tipo retirado entre la carga del formulario y el guardado → 400 de campo, el formulario recarga el catálogo con
`staleTime: 0`, como hace `ConsultationForm` con un síntoma retirado).

## R4. Cambiar el tipo: en el PATCH completo y en una ruta propia sin plan

**Hallazgo**: `PATCH /routines/{id}` (`mutations.go:132-167`) pide plan (`requirePaid`) y rechaza una rutina finalizada;
`service.Update` fuerza el `kind` guardado (`service.go:134`). En el detalle, «Editar» solo sale con `canEdit && !ended
&& canManage`.

**Decisión**:
- El `PATCH` acepta `activityType` **opcional**: ausente = conserva el guardado (FR-006, una app vieja no lo borra);
  presente = mismo control que al crear (activo, solo actividades). Sigue pidiendo plan como hoy.
- **Ruta nueva `PUT /routines/{routineId}/activity-type`** con `{ "activityType": "sports" }`: nivel `fullRoutine` (dueña
  y Tutor de familia de pago; lo personal, su dueña), **sin `requirePaid`**, en cualquier estado (activa, pausada,
  finalizada); 400 si la rutina es un suplemento o el tipo no existe o está retirado (salvo que sea el que ya tiene:
  idempotente, 200). Solo hace `UPDATE … SET activity_type, updated_at`; no toca tomas, marcas ni avisos (FR-005).
- En el detalle de la actividad, la fila «Tipo» lleva «Cambiar» (para quien es `Full`) y abre un diálogo con los tipos
  activos; usa la ruta nueva. El formulario de edición manda `activityType` en el `PATCH`.

**Alternativa descartada**: quitar `requirePaid` del `PATCH` cuando solo cambia el tipo (comparar campo por campo es
frágil y mezcla reglas).

## R5. Segmentos en la sección «Actividades»

**Hallazgo**: la sección del hijo y la de `/yo` las dibuja `features/supplements/RegistroCompacto.tsx` (`kind =
"activity"`, `variant` phone/desktop) con `useRoutines` / `usePersonalRoutines`; el orden viene de `sortRoutines` en el
servidor (activas por su primera toma, luego pausadas y finalizadas).

**Decisión**: solo frontend. Una función pura `groupByActivityType(routines, catalog)` → segmentos en el orden del
catálogo (incluidos los retirados en su `sort_order`), sin vacíos, conservando dentro de cada uno el orden recibido.
`RegistroCompacto` con `kind = "activity"` dibuja un título por segmento y las mismas filas. Si el catálogo no cargó
(error o sin conexión sin copia), se muestra la lista sin segmentos (como hoy) en vez de nada. El catálogo se agrega a
`PERSISTED_ROOTS` (`catalog`, solo si no está) para verse sin conexión.

## R6. Lo que no cambia

- `Hoy` del hijo, la tarjeta del inicio, «Tu día» y el teléfono del hijo: sin segmentos ni tipo (FR-009). El teléfono
  puede recibir el campo en la respuesta de la rutina (no es dato de salud); no se muestra.
- Avisos (`reminder/*`): no leen el tipo.
- Tope de 10 activas por tipo de rutina (`checkActiveCap`): igual.
- `childmerge` mueve la fila entera (`repository.go:398`): el tipo viaja solo. `TestMerge_KnowsEveryChildTable` no
  cambia (no hay tabla nueva con `child_id`).
- Purga (spec 070): `activity_types` no tiene cuenta; nada que borrar. `TestPurge_KnowsEveryTable` debe aceptar la tabla
  de catálogo (como `symptoms`/`vaccine_catalog`).

## R7. Descarga de datos

`dataexport/collect.go:158-166` lista las columnas a mano: se agrega `tipo_de_actividad` con el **nombre** del tipo
(`LEFT JOIN activity_types`), vacío en los suplementos.

## R8. Textos y Principio I

Textos nuevos en un archivo propio (`activityTypeText.ts`) con prueba de redacción (sin «debería», «recomend», «riesgo»,
«bien», «mal», etc.); el nombre del tipo siempre escrito; si el mock trae icono por tipo, decorativo (`aria-hidden`) y
sin rojo/verde/ámbar (`noColorLiterals.test.ts` ya vigila literales).

## R9. Aviso «Antes de empezar» y privacidad

No sube `CurrentDisclaimerVersion` ni cambia el aviso de privacidad: el tipo es una categoría elegida de una lista, no un
dato de salud nuevo (la actividad ya existía).
