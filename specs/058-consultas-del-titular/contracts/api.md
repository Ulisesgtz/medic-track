# Contrato del API: Consultas del titular

Todas las rutas detrás de `RequireSession`, escritas por `*httpx.Responder`, ninguna bajo `/child-device`. Los textos libres
(doctor, notas, medicamentos, texto de búsqueda) solo viajan en cuerpos JSON. Un `accountId` mal formado o sin acceso = 404
(la misma respuesta que una persona que no existe).

## Rutas nuevas con `{accountId}`

`seesPerson` = Mark sobre el perfil (la persona misma, o un Tutor con el interruptor encendido); `fullPerson` = la persona misma.

### `GET /accounts/{accountId}/consultations` — `seesPerson`

`200` — la misma forma que `GET /children/{childId}/consultations` (resumen: `id`, `doctorName`, `consultDate`, `notes`,
`symptoms`, `medicationCount`, `recordOnly`, `createdAt`), más reciente primero. Solo consultas propias de esa persona.

### `POST /accounts/{accountId}/consultations` — `fullPerson`

Cuerpo idéntico a `POST /children/{childId}/consultations` (`doctorName`, `consultDate`, `photoBase64`, `symptomCodes`,
`notes`, `medications[]`, `recordOnly`, `utcOffsetMinutes`, `appointment?`).
- `201` — el detalle de la consulta.
- `422 freemium_consultation_limit_exceeded` `reason: "own_consultations"` — sin plan completo (de su cuenta o de su familia);
  no se guarda nada.
- `422 photo_limit_exceeded` — el tope de 100 fotos de la cuenta (spec 043), contando las propias.
- `400 validation_error` / `symptom_not_available` — como al crear la de un hijo.

### `GET /accounts/{accountId}/overview?from=&to=` — `seesPerson`

`200` — `{ doses: [...], activeTreatment: {...} | null }` con la forma de `GET /children/{childId}/overview` para los
medicamentos (cada toma con `status`, `takenBy`, `consultationId`, `medicationName`); sin suplementos (los personales siguen en
`GET /accounts/{accountId}/routines`). Ventana ≤ 48 h como hoy.

### `POST /accounts/{accountId}/consultations/search` — `seesPerson`

Cuerpo y respuesta de `POST /children/{childId}/consultations/search` (spec 031). `422 … reason: "history_search"` sin plan
completo **de la persona dueña**.

### `GET /accounts/{accountId}/history-options` — `seesPerson`

Como `GET /children/{childId}/history-options`, sobre las consultas propias. Mismo plan.

### `POST /accounts/{accountId}/export` — `fullPerson`

Cuerpo de `POST /children/{childId}/export` (spec 050) sin `sections.vaccinations` (si viene en `true` → `400` campo
`sections.vaccinations`). Respuesta igual con `subject: {kind: "person", firstName, lastName}` en lugar de los datos del hijo y
sin `vaccinations`. `422 … reason: "pdf_export"` sin plan.

### `GET /accounts/{accountId}/appointments` — `seesPerson` · `POST` — `fullPerson`

Como `GET/POST /children/{childId}/appointments` (spec 044): citas propias, con o sin consulta. Crear pide plan
(`reason: "appointments"`).

### `PUT /accounts/{accountId}/consultation-sharing` — `ownsAccount`

Cuerpo `{ "shared": true | false }`.
- `200` — `{ shared, changedAt }`.
- `422 sharing_unavailable` `reason: "no_family"` (no hay con quién compartir) o `"plan"` (la familia no tiene plan de pago);
  solo al encender.

## Ruta nueva con `{consultationId}`

### `PUT /consultations/{consultationId}/my-reminders` — `seesConsultation`

Cuerpo `{ "on": true | false }` → `200 { on }`. Solo para un Tutor sobre una consulta propia compartida;
`400 not_shared` en una consulta de un hijo o para el propio dueño (sus avisos llegan siempre).

## Rutas que cambian su respuesta

- **`GET /accounts/me`**: gana `consultationSharing: { shared, changedAt | null }` y `sharedProfiles: [{ accountId, firstName }]`
  (personas que comparten sus consultas con la sesión y a las que todavía tiene acceso).
- **`GET /consultations/{consultationId}`** y sus acciones: sirven a una consulta propia con el nivel de `OnConsultation`. El
  detalle gana `childId: string | null`, `accountId` (la cuenta dueña) y, en una consulta propia, `myReminders: boolean`. En
  una consulta propia el frontend ofrece editar, finalizar, recorrer y la cita solo si `accountId` es la cuenta de la sesión; el
  servidor lo vuelve a decidir (`fullConsultation`).
- **`POST /consultations/{consultationId}/medications/{medicationId}/extend`**: en una consulta propia pide plan completo
  (`422 … reason: "own_consultations"`).
- **Recordatorios**: el `payload` de una toma propia lleva `childName` vacío para su dueño y el nombre de pila del dueño para un
  Tutor; `source: "medication"` y la acción «Tomada» como siempre.

## Sin cambios (y lo prueban)

`/children/{childId}/…` (lista, overview, búsqueda, export, citas) y todo `/child-device/…` nunca devuelven ni cuentan una
consulta propia.
