# Contrato del API — Unir y ocultar hijos

Todas con sesión, en `internal/server/router.go`, escritas con `*httpx.Responder`, **nunca** bajo `/child-device`.
Ninguna en `AllowedWhilePending` (spec 070). Los nombres y datos de los hijos solo viajan en cuerpos.

## `GET /family/merge-options` — persona invitada activa

Para la pantalla de parejas y la vista previa. 404 `no_family` si quien pide no es integrante activo (Tutor o
Cuidador). `canMerge` = el nivel del actor sobre los hijos de la familia es `Full`.

```json
200
{
  "canMerge": true,
  "familyOwnerFirstName": "Ana",
  "ownChildren": [
    { "id": "…", "hidden": false, "firstName": "Mateo", "lastName": "López", "birthDate": "2022-03-03",
      "height": 92, "weight": 13.4, "growthReferenceSex": "boy",
      "record": { "exists": true, "bloodType": "O+", "pediatrician": { "name": "Dra. Ruiz", "phone": "…", "office": null },
                  "generalNote": null, "allergies": 1, "conditions": 0 },
      "counts": { "consultations": 2, "vaccines": 9, "cardPhotos": 0, "measurements": 1,
                  "supplements": 0, "activities": 0, "activeDevices": 1 } }
  ],
  "familyChildren": [ { "id": "…", "firstName": "Mateo", "lastName": "López", "…": "mismos campos" } ],
  "suggestedPairs": [ { "ownChildId": "…", "familyChildId": "…", "reason": "same_name" } ]
}
```

`suggestedPairs`: nombre (y apellido si ambos lo tienen) iguales sin mayúsculas ni acentos; un hijo de la familia a lo
más una vez. La app la recalcula igual en `pairing.ts` solo para mostrarla; el servidor nunca la aplica.

## `POST /family/merges/preview` — la vista previa (resumen D)

```json
{ "pairs": [ { "ownChildId": "…", "familyChildId": "…" } ] }
```

```json
200
{ "pairs": [ {
  "ownChildId": "…", "familyChildId": "…",
  "differences": ["birthDate", "weight", "bloodType", "pediatrician"],
  "moves": { "consultations": 2, "vaccines": 9, "cardPhotos": 0, "measurements": 1, "supplements": 0,
             "activities": 0, "record": true, "devicesRemoved": 1 },
  "overLimits": [ { "kind": "supplements", "resulting": 12, "limit": 10 } ],
  "recordTooLong": null
} ] }
```

`recordTooLong`: `null` o `{ "list": "allergies", "resulting": 33, "limit": 30 }` (la unión se rechazaría). Sin
cambios en la base. 403 `merge_not_allowed`, 400 `pairs` como en la unión.

## `POST /family/merges` — unir

```json
{ "pairs": [ { "ownChildId": "…", "familyChildId": "…",
               "choices": { "birthDate": "family", "weight": "own", "bloodType": "own", "pediatrician": "family" } } ] }
```

Cada pareja en su propia transacción (todo o nada por pareja), en el orden recibido.

```json
200
{ "results": [ { "ownChildId": "…", "familyChildId": "…", "status": "merged" },
               { "ownChildId": "…", "familyChildId": "…", "status": "failed", "error": "record_too_long" } ] }
```

Errores por pareja (`error`): `merge_not_allowed`, `not_found`, `record_too_long`, `birth_date_conflict`,
`choices_missing`. Errores de toda la petición: 400 `pairs` (vacía, más de 10, ids repetidos, mal formados), 404
`no_family`, 409 `account_deletion_pending`. Las filas de `error_logs` nunca llevan ids de hijo ni valores.

## `PUT /accounts/{accountId}/hidden-children` — `ownsAccount`

```json
{ "childIds": ["…", "…"] }
```

Reemplaza el conjunto de hijos ocultos de la cuenta. 200 con la cuenta (como `GET /accounts/me`). 409 `no_family` si
la cuenta no es integrante activa de una familia y la lista no está vacía; 400 `childIds` si alguno no es de la cuenta.
Cualquier plan.

## Cambios en respuestas existentes

- `GET /accounts/me` y `GET /accounts/{id}`: `children` ya no trae los ocultos (efectivos); nuevo
  `hiddenChildren: [{ "id", "firstName" }]`; cada hijo trae `merges: [{ "at", "byFirstName" }]` (vacío si no hay).
- `firstUseGuide.ownChildren` (spec 071): sin los ocultos.
- Avisos (spec 011/033): los de un hijo oculto no se mandan a cuentas; el teléfono del hijo sí.
