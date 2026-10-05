# PediTrack

Bitácora médica digital para madres, padres y tutores en México. PediTrack permite registrar y
consultar el historial médico de sus hijos: consultas, recetas, medicamentos y el seguimiento de
si cada dosis fue tomada o no.

## ¿Qué es PediTrack?

Cuando un pediatra receta un tratamiento, es fácil perder el papel, olvidar los horarios de las
dosis o no recordar qué se recetó en la consulta anterior. PediTrack resuelve eso dándole al
tutor un lugar centralizado para:

- **Dar de alta a sus hijos** y ver su edad calculada automáticamente.
- **Registrar cada consulta médica**: doctor, fecha, una foto de la receta, los medicamentos
  recetados (nombre, frecuencia, duración, horario de inicio) y los síntomas observados.
- **Leer la receta automáticamente** — la foto se procesa con OCR **100% en el navegador**
  (`tesseract.js`, la imagen nunca sale del dispositivo hacia un tercero) para sugerir el doctor,
  la fecha y cada medicamento como texto editable. El padre siempre revisa y confirma antes de
  guardar; el dato del OCR nunca se guarda "a ciegas".
- **Marcar cada toma de medicamento** como tomada o no tomada, sin restricción de fecha.

### Principio de diseño: "Registra, nunca interpreta"

Este es el principio más importante del proyecto (ver `.specify/memory/constitution.md`): la app
**guarda fielmente** lo que el médico recetó y lo que el padre observó. **No** calcula dosis por
peso, no sugiere medicamentos, no emite alertas médicas ni interpreta datos de salud de ninguna
forma. El pediatra sigue siendo la única fuente de autoridad médica — la app es solo su bitácora.

### Privacidad

Los datos de salud de menores son el dato más sensible que maneja esta app. Por eso:

- El OCR de las recetas corre enteramente en el navegador del usuario — la foto nunca se envía a
  ningún servicio externo de OCR o IA, solo al backend propio de PediTrack.
- No hay anuncios ni venta/compartición de datos con terceros.
- El registro de errores (`error_logs`) nunca almacena el correo del usuario, solo un
  `account_id` opcional.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Go 1.27 + [chi](https://github.com/go-chi/chi) (router) + [pgx](https://github.com/jackc/pgx) |
| Base de datos | PostgreSQL |
| Frontend | React 19 + TypeScript + Vite, como PWA (mobile-first) |
| Formularios | React Hook Form |
| Estado de servidor | TanStack Query |
| Estilos | Tailwind CSS v4 |
| OCR de recetas | `tesseract.js` (100% cliente) |
| Pruebas | Go `testing` (backend), Vitest + Testing Library (frontend unit), Playwright (E2E) |

Desarrollado con [Spec-Kit](https://github.com/github/spec-kit) (Spec-Driven Development) — cada
feature tiene su especificación, plan y tareas en `specs/<NNN-nombre>/`.

## Estructura del proyecto

```
bitacoraMedix/
├── backend/           Go API — ver backend/CLAUDE.md
│   ├── cmd/api/        Punto de entrada (main.go)
│   ├── internal/       Dominios: account, catalog, consultation, errorlog, httpx, platform
│   └── migrations/     Esquema SQL, se aplica manualmente (ver abajo)
├── frontend/           React PWA — ver frontend/CLAUDE.md
│   ├── src/features/   account-signup, home, consultations
│   ├── src/shared/     Utilidades compartidas
│   └── e2e/             Specs de Playwright
├── specs/              Especificaciones de cada feature (Spec-Kit)
├── .specify/memory/constitution.md   Principios y convenciones del proyecto
└── BACKLOG.md          Trabajo futuro ya decidido pero aún sin spec
```

Para el detalle de cada módulo, ver `CLAUDE.md` en la raíz, `backend/CLAUDE.md` y
`frontend/CLAUDE.md` — se mantienen actualizados como mapa técnico del código.

## Cómo levantarlo en local

### Prerrequisitos

- [Go](https://go.dev/dl/) 1.27 o superior
- [Node.js](https://nodejs.org/) 22 o superior
- [PostgreSQL](https://www.postgresql.org/download/) corriendo localmente (o vía Docker)

### 1. Clonar el repositorio

```bash
git clone https://github.com/Ulisesgtz/medic-track.git
cd medic-track
```

### 2. Base de datos

Crea una base de datos local (el nombre y credenciales son solo un ejemplo, ajusta a tu entorno):

```bash
createdb -U postgres pediTrack
```

Aplica las migraciones en orden (no hay herramienta de migración integrada todavía, se aplican
manualmente):

```bash
export DATABASE_URL="postgres://postgres:tu_password@localhost:5432/pediTrack?sslmode=disable"

for f in backend/migrations/*.sql; do
  echo "Aplicando $f"
  psql "$DATABASE_URL" -f "$f"
done
```

### 3. Backend

```bash
cd backend
export DATABASE_URL="postgres://postgres:tu_password@localhost:5432/pediTrack?sslmode=disable"
go run ./cmd/api
```

El API queda escuchando en `http://localhost:8080`. Variables de entorno opcionales:

| Variable | Default | Uso |
|---|---|---|
| `DATABASE_URL` | *(requerida)* | Cadena de conexión a PostgreSQL |
| `PORT` | `8080` | Puerto del servidor HTTP |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Origen permitido por CORS |

La documentación interactiva de la API (Swagger UI, generada desde los comentarios Go) queda
disponible en `http://localhost:8080/swagger/index.html` mientras el backend está corriendo.

### 4. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

La app queda disponible en `http://localhost:5173`. Con el backend y el frontend corriendo,
entra ahí, crea una cuenta y empieza a dar de alta hijos y consultas.

## Pruebas

```bash
# Backend — requiere DATABASE_URL apuntando a una base de datos local
cd backend
go test ./... -cover

# Frontend — pruebas unitarias con cobertura
cd frontend
npx vitest run --coverage

# Frontend — pruebas E2E (requiere backend y frontend corriendo)
cd frontend
npx playwright test

# Type-check y lint del frontend
cd frontend
npx tsc --noEmit && npx eslint .
```

El proyecto exige >90% de cobertura de pruebas unitarias (Go y React) como gate obligatorio de
CI, más pruebas E2E de Playwright para los flujos críticos (registro, escaneo de receta, marcar
dosis tomada, línea de tiempo de consultas). Ver `.github/workflows/ci.yml`.

## Features implementadas

| Feature | Descripción |
|---|---|
| `specs/001-registro-cuenta-usuario/` | Registro de cuenta (tutor + hijos), límite freemium de 1 hijo gratis |
| `specs/002-registro-log-errores/` | Registro automático de errores (`error_logs`) en cada respuesta 4xx/5xx |
| `specs/003-home-listado-hijos/` | Página de inicio: listado de hijos con edad calculada, alta de hijos adicionales |
| `specs/004-detalle-consulta-hijo/` | Detalle de hijo: consultas médicas, recetas con OCR, medicamentos y seguimiento de dosis |

## Convenciones de contribución

- Ramas `feature/NNN-slug` o `bugfix/NNN-slug` a partir de `develop`; PR de vuelta a `develop`.
  `master` solo se actualiza al desplegar.
- Todo código nuevo (identificadores, comentarios, esquema de base de datos) en inglés; la
  documentación del proyecto (specs, planes, este README) en español.
- Antes de cada push: correr las pruebas de backend y frontend, y el type-check/lint del
  frontend (ver sección "Pruebas" arriba).
- Ver `.specify/memory/constitution.md` para los principios completos del proyecto.
