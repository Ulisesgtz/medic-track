# Investigación: Botiquín de la casa

## R1 — De quién es el botiquín y quién puede qué

- **Decisión**: el botiquín es de la **cuenta dueña de la familia** (`medicine_cabinet_items.account_id`). Las rutas van bajo
  `/accounts/{accountId}/medicine-cabinet…` con el `accountId` de la dueña y se protegen con la regla que ya existe
  `access.OnAccount` (`levelCase("FALSE")`): la dueña `Full`; un Tutor `Full` si la dueña está en `paid`, si no `Mark`; un
  Cuidador `Mark`; un integrante Hijo y cualquier otra persona `None`. Ver = `seesAccount` (Mark); agregar, editar y quitar =
  `fullAccount` (Full). El frontend usa `account.family?.ownerAccountId ?? account.id`.
- **Justificación**: es la misma noción de «familia» de agregar hijos (`fullAccount` ya existe en `router.go`); se deriva en cada
  petición, sin caché, y una cuenta sin familia es su propia dueña.
- **Alternativas**: una tabla `cabinets` (sobra: hay uno por familia); el `itemId` en la raíz de la ruta con una regla nueva
  `OnCabinetItem` (más código; con el `accountId` en la ruta el repositorio solo filtra `account_id = $1 AND id = $2`).

## R2 — El plan

- **Decisión**: **agregar** pide `owner.plan = 'paid'`, leído en la transacción con la fila de la dueña `FOR UPDATE` → 422
  `freemium_consultation_limit_exceeded` `reason: "medicine_cabinet"`. **Ver, editar y quitar** no piden plan (el nivel ya baja
  al Tutor de una familia vencida a `Mark`; la dueña sigue `Full`). Tope de **200** por familia en la misma transacción → 422
  `cabinet_limit_exceeded`.
- **Justificación**: como las specs 051 y 060 (corregir no se cobra) y la cartilla (spec 046, tope revisado con la fila bloqueada).

## R3 — La foto

- **Decisión**: una foto opcional por medicamento en la misma fila (`photo BYTEA NULL`), validada con `imagecheck.LooksLike` y
  ≤ 5 MiB (el patrón de `vaccination.DecodePhoto`), cuerpo ≤ 8 MiB. La lista y el detalle dicen `hasPhoto`; la imagen se pide
  aparte (`GET …/{itemId}/photo` → `{photoBase64}`) solo al mostrarla. Al editar: `photoBase64` ausente = no cambia, `""` = la quita.
  No cuenta en el tope de 100 recetas.
- **Frontend**: `shrinkPhoto` (spec 043) antes de enviar, input **sin `capture`**, `PhotoViewer label="Foto de la caja"`.

## R4 — La lectura de la foto

- **Decisión**: `useOcrSuggestion` (tesseract.js en el teléfono) + un parser puro nuevo `parseMedicineText(text)` →
  `{ name?, strength?, expires?: {year, month, day?} }`:
  - **Concentración**: la primera coincidencia de `\d+(?:[.,]\d+)?\s*(mg|g|mcg|µg|ml|UI)(\s*/\s*\d+(?:[.,]\d+)?\s*(ml|g))?`.
  - **Caducidad**: tras «CAD», «Cad.», «Caduca», «EXP», «Vence», «Venc.»; formatos `MM/AAAA`, `MM/AA`, `MM-AAAA`, `dd/mm/aaaa` y
    `MES AAAA` con los meses en español (ENE…DIC) e inglés (JAN…DEC). Sin una de esas palabras no se adivina una fecha.
  - **Nombre**: la línea más «de nombre» de las primeras: la más larga con letras, sin dígitos de la concentración, sin palabras
    de empaque («tabletas», «suspensión», «contiene», «hecho en», «lote»…), recortada a 120.
  - Lo propuesto **solo llena campos vacíos**; la cantidad nunca.
- **Justificación**: mismo enfoque que `parseVaccineText` (spec 046): propone, el padre confirma.

## R5 — Pantallas y entradas

- **Decisión**: `features/medicineCabinet/` con `/botiquin` (lista), `/botiquin/nuevo` (formulario), `/botiquin/:itemId`
  (detalle) y `/botiquin/:itemId/editar`. Todo dentro de `RequireSession` y `AppShell`, dos diseños con `useIsDesktop`,
  `PageHeader`, `StickyActionBar`, `ConfirmDialog` de la familia y `PhotoViewer`.
  - **Inicio**: una fila «Checa tus medicamentos» debajo de «Tus hijos» (antes de «Lo demás»).
  - **Barra lateral web**: «Botiquín» en el grupo Familia.
  - **Atajo**: «Agregar al botiquín» en `MedicationCard` del detalle de la consulta (hijo y propia), para quien puede agregar.
    Navega a `/botiquin/nuevo` con el nombre, la fecha y el doctor en el **estado del router**, nunca en la dirección (Principio II).
- **Buscador**: filtra en el teléfono con un `fold` sin acentos sobre la lista ya cargada.

## R6 — Textos

- **Decisión**: `cabinetText.ts` con todas las frases; `cabinetText.test.ts` prohíbe «caducad», «vencid», «se puede usar», «no
  usar», «tirar», «urgente», «alerta», «debes» (Principio I). La fecha se formatea con los meses de `shared/date.ts`.

## R7 — Plan gratuito en la app

- **Decisión**: `PlanLimitReason` nuevo `medicine_cabinet` en `FreemiumLimitModal`/`planCopy.ts` («Botiquín de la casa»).
  `cabinetAccess(account)` decide `canView` / `canAdd` / `canEdit` / `isFree` con la misma lógica que `addChildTarget`.
