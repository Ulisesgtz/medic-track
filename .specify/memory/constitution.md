<!--
Sync Impact Report
Version change: 1.2.0 → 1.6.0 (combines the 1.3.0 coverage-principle
  addition, the 1.3.1 PostgreSQL confirmation, the 1.4.0 E2E-testing
  addition, the 1.5.0 backend-security-coder addition, and this 1.6.0
  git-branching-strategy addition)
Modified principles: Principio VI extended (see below); none renamed
Added principles: VI. Cobertura de Pruebas Obligatoria (NON-NEGOTIABLE) — all
  written code (Go + React) MUST have unit tests with >90% coverage, enforced
  as a CI gate. Now also requires Playwright E2E tests for critical user
  flows (login, prescription scan, mark-dose-taken, consultation timeline)
  as a separate CI gate.
Added content: coverage tooling notes added to both the Go subsection
  (`go test -cover`) and the React subsection (Vitest/Jest + Testing Library,
  now also Playwright / `playwright-skill` / `e2e-testing`) of "Convenciones
  de Código", cross-referencing Principio VI. PostgreSQL added explicitly to
  Principio III. `backend-security-coder` added as a MUST-consult skill in
  the Go subsection for new/sensitive endpoints.
Added sections: new "Control de Versiones (Git / GitHub)" subsection under
  "Flujo de Desarrollo" — numbered specs/NNN-* folders per spec/plan/tasks,
  one Git branch per numbered folder (`feature/NNN-...` or `bugfix/NNN-...`),
  branches off `develop`, PR to `develop` once a task's tests pass, `master`
  updated only on deploy and deploys always run off `master`.
Removed sections: none
Deferred items / TODOs: this Git workflow assumes a GitHub-backed git repo,
  which this project does not have yet (confirmed not a git repo) — flagged
  in the new subsection itself, to be set up before the first real branch/PR.
-->

# PediTrack Constitution

## Core Principles

### I. Registra, Nunca Interpreta (NON-NEGOTIABLE)
La app MUST guardar fielmente lo que el médico recetó y lo que el padre/madre observó; cero
opiniones, diagnósticos o interpretaciones médicas. Prohibido: calculadoras/validadores de dosis
por peso, sugerencias de medicamentos, alertas médicas o cualquier función que "opine" sobre datos
de salud. Sí permitido: graficar/recordar lo que el médico ya registró (curvas de crecimiento,
recordatorios de la dosis tal cual fue recetada).
Razón: riesgo legal y de reputación frente a los médicos; los pediatras deben ser aliados y canal
de recomendación (modelo B2B2C), no sentirse cuestionados por la app.

### II. Privacidad y Protección de Datos
El aviso de privacidad LFPDPPP MUST estar vigente desde el día 1 (datos sensibles de salud de
menores). Prohibido terminantemente: anuncios y venta o compartición de datos con terceros. Se
MUST verificar exención de COFEPRIS antes de lanzamiento (la app no diagnostica ni dosifica). Los
datos del usuario nunca se secuestran como palanca de monetización — ver Principio IV.

### III. Stack Tecnológico Fijo
Backend en **Go**; frontend en **React** como **PWA** (Progressive Web App), mobile-first y
responsive para web de escritorio y móvil. Base de datos: **PostgreSQL**. La captura de fotos de
recetas MUST usar
`<input type="file" accept="image/*" capture>` (funciona de forma confiable en iOS/Android en modo
standalone) — MUST NOT depender de `getUserMedia`/cámara en vivo para el flujo core de escaneo,
dado el bug conocido de WebKit en PWAs instaladas en iOS. Camino de evolución a app nativa (fase 2)
vía React Native, reutilizando lógica y componentes de la PWA.

### IV. Freemium Disciplinado
El plan gratuito es de por vida, con escaneos ilimitados y 1 perfil de niño — el producto MUST NOT
limitar por volumen de uso (el uso es episódico, no mensual). El corte gratis/pago sigue a quién
recibe más valor (familias con varios hijos, funciones de curvas OMS/exportar/compartir), nunca al
volumen de escaneos ni al bloqueo de acceso a datos ya capturados.

### V. Simplicidad y MVP Real
El equipo MUST empezar simple (YAGNI): no construir para escala hipotética ni para features de
fase 2/3 antes de validar el MVP. Cada feature nueva MUST justificarse contra el alcance MVP
acordado: login + perfiles de niños, foto→extracción→confirmación manual, timeline de consultas,
recordatorios con "dosis tomada", gráfica peso/talla.

### VI. Cobertura de Pruebas Obligatoria (NON-NEGOTIABLE)
Absolutamente todo el código escrito (backend Go y frontend React) MUST tener su prueba unitaria
correspondiente, con code coverage MUST superior al 90%. No se acepta código de producción sin
pruebas que lo respalden; una feature no se considera terminada si su coverage no cumple el umbral.
El gate de coverage MUST correr en CI y bloquear el merge por debajo del 90%.
Razón: dado que la app maneja datos de salud de menores (ver Principio I y II), un error silencioso
en el código que registra o muestra esos datos es inaceptable; las pruebas son la forma de detectar
regresiones antes de que lleguen a producción.

Adicionalmente, sobre la capa de pruebas unitarias, los flujos críticos de usuario MUST tener
pruebas end-to-end (E2E) con **Playwright**: login, escaneo de receta (foto→extracción→confirmación),
marcar dosis como tomada, y timeline de consultas. Playwright corre en un navegador real (incluyendo
WebKit, que simula Safari/iOS) contra la app completa, y MUST incluirse como gate de CI separado del
gate de coverage unitario — un cambio no se considera listo si rompe un flujo E2E cubierto, aunque
el coverage unitario esté en verde.

## Convenciones de Código

### Go (Backend)
- **Estructura de proyecto:** layout estándar de la comunidad — `cmd/` (entrypoints), `internal/`
  (código privado del módulo), `pkg/` (código reutilizable si aplica). Evitar carpetas
  `utils`/`common` genéricas sin propósito claro.
- **Formato y lint:** `gofmt`/`goimports` obligatorio antes de cada commit; `golangci-lint` como
  gate de CI. Sin excepciones de estilo manual.
- **Manejo de errores:** errores explícitos como valores de retorno, nunca `panic` en flujo normal
  (solo en errores de programación irrecuperables en `init`). Envolver con contexto usando
  `fmt.Errorf("...: %w", err)`. No ignorar errores (`_ = err` solo con comentario justificando por
  qué).
- **Naming:** `MixedCaps`/`mixedCaps`, nunca guiones bajos. Nombres de receptor cortos y
  consistentes (1-2 letras). Paquetes en minúsculas, cortos, sin plural, sin `_` ni `-`.
- **Interfaces:** definidas del lado del consumidor (no exportar interfaces "por si acaso" desde
  el paquete que implementa); mantenerlas pequeñas (1-3 métodos).
- **Concurrencia y contexto:** `context.Context` siempre como primer parámetro en funciones que
  hacen I/O; propagar cancelación/timeouts hasta la capa de base de datos y llamadas a servicios
  de IA externos.
- **Inyección de dependencias:** explícita vía constructores (`NewX(...)`), evitar estado global y
  variables de paquete mutables.
- **Tests:** table-driven tests como patrón por defecto; tests junto al código (`_test.go`); mocks
  solo en las fronteras de interfaces definidas por el consumidor. Coverage MUST verificarse con
  `go test -cover ./...` (o `-coverprofile` para el reporte detallado) y MUST superar 90% por
  paquete, por el Principio VI.
- **Skills de Claude Code recomendadas:** `golang-pro` para código Go idiomático y patrones de la
  librería estándar; `backend-architect` y `software-architecture` cuando el trabajo toque diseño
  de servicios, límites entre paquetes, o decisiones de arquitectura backend más allá de una
  feature aislada; `postgresql` para esquema/consultas/migraciones de base de datos;
  `api-design-principles` al diseñar endpoints nuevos; `testing-qa` para estrategia de pruebas del
  backend; `backend-security-coder` MUST consultarse en todo endpoint nuevo o que maneje datos
  sensibles — cubre prevención de inyecciones (SQL/NoSQL/command), autenticación y autorización,
  CSRF/SSRF, validación de payloads, rate limiting, manejo seguro de errores/logs y secretos.
  Justificado por los Principios I y II (datos de salud de menores).

### React (Frontend / PWA)
- **TypeScript obligatorio** — sin archivos `.js`/`.jsx` nuevos.
- **Componentes funcionales + hooks únicamente** — sin componentes de clase.
- **Naming:** componentes en `PascalCase` (un componente por archivo, mismo nombre que el
  archivo); hooks propios con prefijo `use` en `camelCase`; utilidades y helpers en `camelCase`.
- **Estructura por feature**, no por tipo — agrupar componentes, hooks y estilos de una misma
  funcionalidad juntos (ej. `features/timeline/`, `features/dosis/`), evitar carpetas planas
  `components/`, `hooks/` a nivel raíz para todo el proyecto.
- **Manejo de estado:** `useState`/`useReducer`/Context para estado local y de UI; librería de
  fetching de datos servidor (ej. React Query/TanStack Query) para estado remoto y caché — evitar
  Redux u otras librerías de estado global pesadas salvo necesidad demostrada.
- **Estilos:** utility-first (Tailwind) para mantener consistencia responsive mobile-first sin CSS
  a medida disperso.
- **Lint y formato:** ESLint + Prettier obligatorios como gate de CI, mismas reglas para todo el
  equipo.
- **Tests:** Vitest/Jest + Testing Library para pruebas unitarias de componentes y hooks; coverage
  MUST superar 90%, por el Principio VI. Playwright para pruebas E2E de los flujos críticos
  (skill de Claude Code: `playwright-skill` o `e2e-testing`).
- **Composición sobre prop drilling:** preferir composición de componentes y Context antes que
  pasar props por más de 2-3 niveles.
- **PWA:** `manifest.json` y service worker mantenidos como parte del build, no como añadido
  opcional; probar siempre el flujo de "agregar a pantalla de inicio" en iOS y Android antes de
  cada release mayor.
- **Skills de Claude Code recomendadas:** `react-best-practices` y `frontend-developer` para
  componentes/hooks/estado; `react-native-architecture` cuando se planee la fase 2 nativa (ver
  Principio III), para mantener decisiones de hoy compatibles con esa migración; `ui-ux-pro-max`
  para diseño de interfaces y experiencia de usuario.

## Flujo de Desarrollo

- Toda feature nueva pasa primero por `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`
  antes de implementar, salvo fixes triviales.
- Cambios que toquen el Principio I (registra, nunca interpreta) o el Principio II (privacidad)
  MUST requerir confirmación explícita del usuario antes de implementarse, sin importar el tamaño
  del cambio.
- Las skills de Claude Code listadas en "Convenciones de Código" son las de referencia por área
  para este proyecto (backend Go, frontend React). Son sugerencias de qué skill invocar según el
  tipo de trabajo, no una restricción — se puede usar otra skill global si el caso lo amerita, pero
  estas son el punto de partida esperado.

### Control de Versiones (Git / GitHub)
- Cada spec, plan y tasks MUST vivir en su propia carpeta numerada correlativamente
  (`specs/001-nombre-feature/`, `specs/002-siguiente-feature/`, ...) — esto ya lo genera
  automáticamente `/speckit-specify` y sirve como registro histórico de cambios.
- Cada carpeta numerada MUST tener su propia rama de Git, nombrada
  `{tipo}/{NNN}-{nombre-corto}`, donde `{tipo}` es `feature` o `bugfix` (ej.
  `feature/001-escaneo-receta`, `bugfix/007-recordatorio-duplicado`).
- **Estructura de ramas:** `develop` es la rama base de trabajo — toda rama `feature/`/`bugfix/`
  MUST salir de `develop`. `master` MUST representar siempre el código en producción — nunca se
  trabaja directo sobre `master`.
- Al cerrar una tarea y que sus pruebas pasen (coverage >90% y, si aplica, E2E con Playwright —
  Principio VI), MUST abrirse un Pull Request de la rama `feature/`/`bugfix/` hacia `develop`.
- `master` MUST actualizarse únicamente en cada deploy (merge de `develop` a `master` como parte
  del proceso de release) — los deploys MUST correr siempre sobre el código de `master`, nunca
  sobre `develop` directamente.
- Pendiente: este flujo asume un repositorio Git con remoto en GitHub, que este proyecto aún no
  tiene inicializado — se configura antes de la primera rama/PR real.

## Governance

Esta constitución tiene prioridad sobre preferencias de estilo individuales o atajos de
conveniencia. Cualquier excepción a un principio MUST quedar documentada en el spec/plan
correspondiente con la justificación. Enmiendas a este documento requieren decisión explícita del
usuario (no del agente) y se registran actualizando la fecha de "Last Amended" abajo. Versionado
semántico: MAJOR para remoción/redefinición incompatible de principios; MINOR para principios o
secciones nuevas; PATCH para aclaraciones, correcciones de redacción o reorganizaciones sin cambio
de significado.

**Version**: 1.6.0 | **Ratified**: 2026-09-14 | **Last Amended**: 2026-09-15
