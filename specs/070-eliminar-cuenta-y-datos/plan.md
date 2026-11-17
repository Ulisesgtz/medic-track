# Plan de Implementación: Eliminar la cuenta y descargar todos mis datos

**Rama**: `feature/070-eliminar-cuenta-y-datos` | **Fecha**: 2026-11-12 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/070-eliminar-cuenta-y-datos/spec.md`

## Resumen

Dos funciones nuevas en «Mi cuenta» (`/cuenta`), en cualquier plan.

**«Descargar mis datos».** El API arma **en flujo** un ZIP con `LEEME.txt`, `datos.json`, un CSV por tipo y las fotos.

- No guarda ninguna copia.
- Los Tutores de una dueña que pidió eliminarse pueden descargar los datos de esos hijos.

**«Eliminar mi cuenta».**

- **Al pedirla**: con identidad reciente (Clerk) y la palabra `ELIMINAR`, la cuenta queda **programada a 30 días** en `account_deletions` (migración `0037`). La suscripción se cancela en ese momento.
- **Durante el plazo**: la cuenta solo puede descargar y cancelar (un middleware con una lista cerrada de rutas). Sus avisos se detienen y sus invitados bajan a «ver y marcar».
- **Al vencer**: un proceso del API cada 10 minutos borra el usuario de Clerk y, en **una transacción**, todos los datos de la cuenta y de sus hijos, de las hojas a la raíz (no hay cascadas). Lo que una persona invitada creó o marcó en hijos ajenos se conserva **sin autor**. Queda una constancia sin datos personales.
- **Después de restaurar un respaldo**: `cmd/accounts reconcile-deleted` vuelve a borrar las cuentas cuyo usuario ya no existe en Clerk.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.4 (`backend/`); React 19 + TypeScript (`frontend/`, PWA).

**Dependencias Principales**:
- Ya usadas: `pgx/v5`, `chi`, `clerk-sdk-go/v2` v2.7.0 (`user.Delete`, `SessionClaims.NeedsReverification`), `@clerk/react` 6.16 (`useReverification`), TanStack Query.
- `archive/zip` y `encoding/csv` de la biblioteca estándar.
- **Ninguna dependencia nueva.**

**Almacenamiento**:
- PostgreSQL: tabla nueva `account_deletions` y columnas de autoría que pasan a nulas.
- Nada en disco: el ZIP no se guarda.

**Pruebas**:
- `go test` contra la base de pruebas: el borrado completo, la prueba de «tablas conocidas», el middleware, el ZIP y la privacidad.
- `vitest` para las pantallas.
- Playwright a 390 y 1280 px: descargar, pedir, la pantalla en pausa y cancelar.

**Plataforma Objetivo**: el API en Railway (el proceso de borrado corre dentro) y la PWA en Cloudflare Pages.

**Tipo de Proyecto**: aplicación web (backend + frontend).

**Objetivos de Rendimiento**:
- El ZIP de una cuenta típica (3 hijos, 100 consultas con foto) llega en menos de 2 minutos (SC-001), sin juntarlo en memoria.
- El borrado de una cuenta tarda unos segundos dentro de su transacción.

**Restricciones**:
- Ningún dato de salud, nombre de hijo ni contenido del archivo en direcciones, `error_logs` ni correos.
- Borrado real, no oculto.
- Nada depende del plan.
- La cuenta en pausa no escribe nada.

**Escala/Alcance**:
- 4 rutas nuevas, 1 proceso, 1 comando y 1 migración.
- 2 pantallas nuevas (`/cuenta`, `/cuenta/eliminar`), la pantalla en pausa y el aviso a los invitados.

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | El archivo lleva lo registrado tal cual, sin alertas ni juicios (FR-005). Los textos de la eliminación son neutrales. |
| II. Privacidad (LFPDPPP) | ✅ | Es el derecho de cancelación y el acceso a los datos. Borrado real, incluido el usuario de Clerk. El ZIP no se guarda en el servidor. Ningún dato de salud en direcciones, registros ni correos. Las copias de respaldo caducan solas. **Pendiente del dueño**: aviso de privacidad. |
| III. Stack fijo | ✅ | Go, PostgreSQL y React PWA. Biblioteca estándar para el ZIP y el CSV. |
| IV. Freemium disciplinado | ✅ | Descargar y eliminar en **cualquier** plan (FR-020): los datos nunca se secuestran. |
| V. Simplicidad | ✅ | Sin cola ni almacenamiento nuevos: el borrado es un proceso más del API, como `retention`. Lo que cambia durante el plazo se **deriva** de una fila, así que cancelar no necesita deshacer nada. Fuera de alcance: borrar un solo hijo y transferir hijos (BACKLOG). |
| VI. Cobertura | ✅ | Más del 90 % en los paquetes nuevos y E2E del flujo crítico (descargar, pedir, en pausa, cancelar) a 390 y 1280 px. |

**Gate**: aprobado. Una regla del proyecto necesita precisión (Seguimiento de Complejidad): el ZIP es binario y no JSON.

**Re-verificación tras el diseño (Fase 1)**: sin cambios. El diseño no agrega dependencias ni datos nuevos de las personas. `account_deletions` solo guarda un UUID, fechas e intentos.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/070-eliminar-cuenta-y-datos/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R10
├── data-model.md        # account_deletions, autoría nula, qué se borra, el ZIP
├── quickstart.md
├── contracts/
│   ├── api.md           # rutas, errores, proceso y comando
│   └── ui.md            # /cuenta, /cuenta/eliminar, la cuenta en pausa, el aviso a invitados
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0037_account_deletions.sql      # tabla nueva + DROP NOT NULL de autoría
├── cmd/accounts/main.go                        # reconcile-deleted (R7)
├── cmd/api/main.go                             # arranca accountdeletion.RunEvery
├── internal/accountdeletion/                   # nuevo
│   ├── repository.go    # Request, Cancel, Status, Due (SKIP LOCKED), Complete
│   ├── purge.go         # el borrado en orden, en una transacción (R1)
│   ├── service.go       # pedir (cancela la suscripción), cancelar, completar (Clerk → base → correo)
│   ├── middleware.go    # RequireNotPending + la lista cerrada (R3)
│   ├── sweeper.go       # RunEvery, reporta job:account-deletion
│   ├── email.go         # los tres correos (R9)
│   └── handler.go       # GET/POST deletion, POST cancel
├── internal/dataexport/                        # nuevo: el ZIP (R8)
│   ├── collect.go       # lee los datos de una cuenta o de los hijos de una familia
│   ├── write.go         # LEEME, datos.json, CSV, fotos, en flujo
│   └── handler.go       # POST /accounts/{id}/data-export, POST /family/children-export
├── internal/httpx/json.go                      # Responder.Stream
├── internal/authmw/                            # deja los claims en el contexto (R4)
├── internal/access/                            # invitados → Mark si la dueña está en pausa
├── internal/family/                            # 409 family_deletion_pending al invitar/aceptar
├── internal/reminder/                          # excluir destinatarios en pausa
├── internal/account/                           # /accounts/me: deletion y family.deletionScheduledFor
├── internal/mailer/                            # ClassAccount
└── internal/server/router.go (+ router_test.go)

frontend/src/
├── features/account/                           # nuevo
│   ├── AccountPage.tsx          # /cuenta (dos diseños)
│   ├── DeleteAccountPage.tsx    # /cuenta/eliminar
│   ├── DeletionPendingScreen.tsx
│   ├── FamilyDeletionNotice.tsx # el aviso a los invitados
│   ├── downloadData.ts          # fetch → Blob → Compartir/Descargar
│   └── api.ts
├── features/home/MoreLinks.tsx, ChildrenSidebar.tsx   # «Mi cuenta»
├── App.tsx                                     # rutas y la pantalla en pausa
└── e2e/eliminar-cuenta.spec.ts
```

**Decisión de Estructura**: aplicación web existente (backend Go + frontend React). Dos paquetes nuevos en el backend para separar borrar de exportar, porque cada uno tiene sus propias pruebas. Una carpeta de funcionalidad nueva en el frontend.

## Seguimiento de Complejidad

| Violación | Por Qué Es Necesaria | Alternativa Más Simple Rechazada Porque |
|---|---|---|
| Una respuesta binaria (ZIP) en un backend donde «toda respuesta va por `Responder` como JSON» | El archivo de datos no es JSON y debe ir en flujo | Mandarlo en base64 dentro de un JSON multiplicaría el tamaño y obligaría a tenerlo entero en memoria. Se agrega `Responder.Stream`, así los errores siguen pasando por `Responder` y se registran (R8). |
| `account_deletions` sin llave foránea a `accounts` | Debe sobrevivir al borrado como constancia (FR-018) | Con llave foránea habría que borrarla junto con la cuenta. |
