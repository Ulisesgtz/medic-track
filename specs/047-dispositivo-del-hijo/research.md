# Investigación: Dispositivo del hijo (spec 047)

Cada decisión sale de leer el código que ya existe (`internal/authmw`, `internal/access`, `internal/family/token.go`, `internal/reminder`, `internal/consultation`, `internal/supplement`, `internal/server/router.go`). No quedó ningún `NEEDS CLARIFICATION`.

## R1 — Cómo viaja la credencial

**Decisión**: encabezado `Authorization: Device <credencial>` (no `Bearer`), con la credencial guardada en el almacenamiento del navegador del hijo (`localStorage`, siempre dentro de `try/catch`). No se usa cookie.

**Justificación**
- La API vive en otro origen (`api-dev.pedi-track.com` frente a `dev.pedi-track.com`) y ya se le habla con encabezado en todas las rutas; es el mismo mecanismo que usa la sesión de Clerk, así que CORS no cambia (`Authorization` ya está permitido).
- Una cookie sería **más frágil en iOS**: `api-dev` apunta por CNAME a Railway y Safari limita a 7 días las cookies de un subdominio con CNAME hacia otro dominio (ITP); además exigiría defensa contra CSRF. Un encabezado manual no tiene CSRF.
- El esquema `Device` (y no `Bearer`) separa por construcción las dos identidades: el middleware de Clerk solo mira `Bearer`, así que con una credencial de hijo **toda ruta de padres responde 401** sin que nadie tenga que acordarse de excluirla; y el middleware del hijo solo acepta `Device`, así que un token de Clerk no abre las rutas del hijo.
- El `localStorage` de una PWA instalada en pantalla de inicio no tiene el tope de 7 días de ITP; en una pestaña de Safari sí. Por eso la pantalla de la liga y el primer inicio del hijo **sugieren instalar la app** (la guía `PROBAR.md` ya lo explica para iPhone). Si el navegador borra el almacenamiento, el hijo pierde el acceso y el padre genera otra liga: es el costo aceptado.
- El service worker no necesita la credencial: la acción «Tomada» del aviso usa el token firmado propio de cada aviso (ver R5).

**Alternativas descartadas**: cookie `HttpOnly SameSite` (ITP + CSRF + CORS con credenciales); JWT firmado (no se puede quitar al instante sin consultar la base, y entonces no aporta nada); reutilizar `Bearer` (obligaría a distinguir los dos tipos dentro del mismo middleware y una rama podría saltarse a la otra).

## R2 — Formato, rotación y caducidad de la credencial

**Decisión**
- **Ficha opaca**: 32 bytes aleatorios en base64url (igual que las invitaciones de la spec 032, `family/token.go`). Solo se guarda su **SHA-256**; se busca por igualdad de huella (una huella de 256 bits aleatorios no se puede adivinar ni medir por tiempo).
- **La liga** (ficha distinta de la credencial) se canjea una sola vez: pasa de `pending` a `active` en una sola sentencia y devuelve la credencial.
- **Rotación**: `GET /child-device/me` dice `rotateAfter`; cuando pasó (7 días desde la última rotación) el cliente llama `POST /child-device/rotate`, que guarda la huella nueva, **deja la anterior válida 24 horas** (`credential_hash_previous`, por si dos pestañas o un reintento de red usan la vieja) y devuelve la nueva una sola vez.
- **Caducidad por falta de uso**: `last_seen_at + 90 días`; cada petición válida renueva. Una credencial caducada responde igual que una desconocida.
- **`last_seen_at` solo se escribe si tiene más de 10 minutos** (una escritura a lo más cada 10 minutos por dispositivo, no una por petición).

**Justificación**: la ficha opaca permite quitar al instante (R3); la rotación hace inútil una copia robada una vez que el aparato legítimo rota; la ventana de gracia evita sacar al niño por una carrera.

**Descartado**: revocar de golpe cuando se usa una credencial ya rotada (un reintento legítimo lo expulsaría); preguntar de nuevo al padre cada cierto tiempo (molesta al niño y no suma seguridad real).

## R3 — Segunda identidad en el servidor, por construcción

**Decisión**: un grupo de rutas **propio** `/child-device/*` con su middleware `RequireChildDevice` (lee `Authorization: Device`, resuelve la huella contra la base **en cada petición**, deja un `childdevice.Principal` en el contexto: vínculo, hijo, cuenta dueña, nombre de pila del hijo). Las rutas existentes no se tocan: siguen detrás de `RequireSession` (solo Clerk).

Dentro del grupo, **lista blanca explícita** (FR-011), montando los **mismos handlers** que ya sirven a los padres, con tres guardas pequeñas que aseguran que el recurso es del hijo del dispositivo y que dejan `access.Access{Level: Mark, ActorDeviceID}` en el contexto:

| Ruta del hijo | Handler que se reutiliza | Guarda |
|---|---|---|
| `GET /child-device/me` | nuevo (chico) | — |
| `POST /child-device/rotate` | nuevo | — |
| `GET /child-device/children/{childId}/overview` | `Consultation.GetChildOverview` | `sameChild` |
| `GET /child-device/children/{childId}/routines` | `Supplement.ListRoutines` | `sameChild` |
| `PATCH /child-device/consultations/{consultationId}/doses/{doseId}` | `Consultation.UpdateDose` | `consultationOfChild` |
| `PATCH /child-device/routines/{routineId}/doses/{doseId}` | `Supplement.UpdateDose` | `routineOfChild` |
| `POST /child-device/routines/{routineId}/done` | `Supplement.MarkRoutineDone` | `routineOfChild` |
| `GET /child-device/reminders/config`, `POST /child-device/reminder-devices[/remove]`, `PUT /child-device/reminder-settings` | nuevos (delgados) | — |

Por construcción **no existe** ruta del hijo para consultas, detalle, fotos, notas, cartilla, citas, familia, planes, cuenta, crear/editar/pausar/finalizar suplementos ni «Tus avisos» de familia. Una credencial de hijo en una ruta de padres es 401 (R1); un token de Clerk en una ruta del hijo es 401. La prueba de `router_test.go` recorre **todas** las rutas registradas con el dispositivo del hijo y exige que solo las de la tabla respondan algo.

> **Ajuste a la spec**: FR-011 dice «responde 403». Con este diseño las rutas de padres responden **401** (la credencial no es una sesión) y las del grupo del hijo que apuntan a recursos ajenos responden **403**. Lo que importa (ninguna devuelve ni cambia datos) se cumple igual; la spec se ajusta a «se rechaza (401 o 403)».

**Alternativas descartadas**: hacer que `RequireSession` acepte las dos identidades (una rama podría saltarse a la otra, y cada ruta existente tendría que decidir si admite al hijo: lista negra); extender `access.OnChild` con dispositivos (mezcla el nivel de una persona con el de un aparato).

## R4 — Quién marcó la toma («por Mateo»)

**Decisión**: columna nueva `taken_by_child_device_id UUID NULL REFERENCES child_device_links (id)` en `doses` y en `supplement_doses`, con el CHECK de que hay **a lo más un autor** (cuenta o dispositivo) y que no hay autor si no está marcada. Los datos existentes no cambian (columna nula).

- **Nombre que se muestra**: el **nombre de pila del hijo** (`children.first_name`, ya existente) — nunca el nombre que el padre le puso al aparato. Nada nuevo sobre el menor.
- **`Actor`** (en `consultation` y `supplement`) gana `DeviceID`; `access.Access` gana `ActorDeviceID`. `takenBy.mine` es verdadero si el autor coincide con la cuenta **o** con el dispositivo del actor.
- **Desmarcar**: el dispositivo solo la suya (`taken_by_child_device_id = actor`), un `Full` cualquiera; sin cambios para las cuentas.
- **Si se quita el dispositivo, la marca se conserva** y sigue diciendo «por Mateo»: el vínculo nunca se borra, solo cambia a `revoked`.
- **Primera marca gana** igual que hoy.

**Descartado**: un autor genérico sin llave (no se podría saber cuál marcó ni aplicar «solo la suya»); crear una cuenta falsa por dispositivo (ensucia `accounts`, que exige correo).

## R5 — Avisos al dispositivo del hijo

**Decisión (aditiva, sin tocar las llaves primarias existentes)**
- `reminder_devices` admite dos dueños: `account_id` pasa a nulo-permitido y se agrega `child_link_id` nulo-permitido, con `CHECK ((account_id IS NULL) <> (child_link_id IS NULL))`. Todas las consultas actuales filtran por `account_id = …`, así que **ignoran por sí solas** las filas del hijo (y las citas y la familia nunca llegan al hijo).
- Tablas nuevas `child_dose_reminders (dose_id, link_id)` y `child_supplement_dose_reminders (dose_id, link_id)`, llave primaria por (toma, vínculo): a lo más **un aviso por toma y dispositivo**, aunque corran dos ticks. El reclamo es una sentencia `INSERT … ON CONFLICT DO NOTHING RETURNING` como `ClaimDueDoses`.
- Destinatarios: vínculos `active` del hijo de la toma, con un dispositivo `reminder_devices` activo **activado antes de la toma**, sin toma marcada, sin tratamiento finalizado/cancelada/«sin registrar» (las mismas condiciones de candidata que `ClaimDueDoses` y `ClaimDueSupplementDoses`; se comparten extrayendo el CTE de candidatas a una constante SQL para no duplicar la regla).
- `DueDose` gana `ChildLinkID`; `Tick` resuelve los aparatos con `ActiveDevicesForLink` y envía con el mismo `Sender`. El 404/410 del push apaga ese dispositivo (`DeactivateByID`, ya existente).
- **Texto**: genérico por omisión; el detalle (nombre del medicamento) lo elige la persona Tutora **por dispositivo** (`child_device_links.reminder_detail`, nulo = genérico). El payload no lleva nada de la familia.
- **Acción «Tomada»/«Realizado»**: el token HMAC ya nombra la toma y el aparato (`reminder_devices.id`); `MarkTakenByAction` gana una rama: si el aparato es de un vínculo, exige que el vínculo siga `active`, que la toma sea de **su** hijo y marca con `taken_by_child_device_id`. Cualquier otra cosa es el mismo `ErrInvalidActionToken`.
- Quitar el vínculo desactiva sus aparatos en la misma transacción.

**Descartado**: ampliar las llaves de `dose_reminders` a (toma, destinatario) con destinatario polimórfico (migración riesgosa sobre tablas con datos y con relleno); una cuenta sombra por dispositivo.

## R6 — Modelo de datos y topes

**Decisión**: una tabla `child_device_links` con ciclo `pending → active → revoked` (migración `0029`, ver `data-model.md`). Crear una liga corre en una transacción que **bloquea la fila de la cuenta dueña** (plan de pago) y la **fila del hijo** (tope de 3 entre vínculos activos y ligas pendientes sin vencer), el mismo patrón que las fotos de la cartilla y los suplementos; `tx` y nunca el pool dentro de la transacción (lección de la spec 045). Canjear es una sola sentencia `UPDATE … WHERE status = 'pending' AND expires_at > now() AND token_hash = $1 RETURNING …`: dos canjes a la vez, uno gana.

## R7 — Plan

**Decisión**: crear una liga exige plan de pago (422 `freemium_consultation_limit_exceeded` con `reason: "child_device"`, mismo patrón que los demás); listar, quitar, canjear, usar, rotar y los avisos **nunca** piden plan. Con el plan caducado el dispositivo sigue viendo y marcando (no se consulta el plan en `RequireChildDevice`).

## R8 — Frontend

- Rutas **públicas** y fuera del `AppShell` de padres: `/hijo` (canjea la ficha del `#`, guarda la credencial y entra) y `/hijo/hoy` (la vista del hijo). No pasan por `RequireSession` ni usan `useAuth` de Clerk.
- Un cliente HTTP **propio** (`features/childDevice/api.ts`) con su clave de almacenamiento: las pantallas de padres jamás lo importan (una prueba lo vigila) y la del hijo jamás importa el token de Clerk. Dos almacenamientos separados: la sesión de un padre en el mismo teléfono no se mezcla con la del hijo.
- La vista del hijo reutiliza solo piezas presentacionales (`DoseChipView`, `DayProgress`, `RealizadoButton`, `scheduleText`) y sus propios hooks; nada de `useCurrentAccount`.
- Si una petición del hijo responde 401/403 la app borra la credencial y muestra «Este acceso ya no está activo. Pídele a tu papá o mamá uno nuevo.» sin datos del hijo.
- «Acceso del hijo» en la ficha del hijo (`ChildDetailPage`, ambos diseños) y en Familia: usa `ConfirmDialog`, `PlanAvisoCompacto` y `FreemiumLimitModal` con motivo nuevo `child_device` (`planCopy.ts` es el único lugar de los textos).
- Sin mock entregado: sistema visual, móvil primero para la vista del hijo; se ofrece pedir uno a Claude Design.
- **Avisos del hijo**: el service worker ya sabe mostrar el aviso y mandar «Tomada» con el token del aviso; la suscripción push de la vista del hijo se registra en `/child-device/reminder-devices` con su credencial.

## R9 — Seguridad (amenazas y mitigaciones)

| Amenaza | Mitigación |
|---|---|
| La liga se reenvía o la abre otra persona | Un solo uso (la segunda persona recibe «ya no sirve»), vence en 24 h, el padre ve la lista, el nombre y «última vez» y quita al instante |
| Teléfono perdido o prestado | Quitar al instante; solo ve y marca lo de un hijo; caduca a los 90 días sin uso |
| Credencial copiada | Huella en la base, rotación cada 7 días con 24 h de gracia, quitar corta la siguiente petición |
| Fuerza bruta de fichas | 256 bits aleatorios; canje con `StrictRateLimit`; las rutas del hijo con el límite general por dirección |
| Enumeración (¿existe esta liga?) | Misma respuesta 404 para desconocida, usada, vencida o cancelada; sin tiempos distintos de importancia (todo es una sola sentencia por huella) |
| CSRF | No hay cookie: el encabezado lo pone el código de la app |
| XSS que lea el almacenamiento | CSP existente (`public/_headers`); la credencial solo da ver y marcar un hijo; se puede rotar y quitar |
| Fuga en registros | La ficha y la credencial viajan solo en el cuerpo/encabezado `Authorization`; nunca en direcciones, `error_logs` ni mensajes; el 401 del hijo se escribe con `WriteJSONErrorUnlogged` (cualquiera lo provoca) |
| Mezcla con la sesión del padre | Esquemas `Device` y `Bearer` distintos, almacenamientos separados, grupos de rutas separados |
| El nombre del dispositivo (texto libre) | Solo en cuerpos, ≤ 40 caracteres, limpio de caracteres de control, nunca en direcciones |

## R10 — Pruebas

Unitarias (huella, caducidad con reloj inyectable, rotación con gracia), repositorio contra la base real (dos canjes a la vez → uno gana; tope de 3 bajo bloqueo con seis creaciones paralelas; quitar corta la siguiente petición; caducidad; la marca del hijo y «solo la suya»; reclamo de avisos: uno por toma y dispositivo, ninguno si está marcada o el vínculo está quitado), `router_test.go` con el dispositivo del hijo en **todas** las rutas, privacidad en `error_logs` (ni ficha ni credencial ni nombre), y E2E a 390 y 1280 px con dos sesiones (Tutor y dispositivo del hijo): canje, ver y marcar, «por Mateo» en la sesión del Tutor, quitar corta de inmediato, y que no abre nada fuera de lo suyo. Cobertura > 90 %.

## R11 — Aviso «Antes de empezar»

Sube `CurrentDisclaimerVersion` a la fecha del cambio y agrega una frase: el acceso del hijo muestra sus tomas y actividades en el teléfono que el padre elija, y se quita en cualquier momento.
