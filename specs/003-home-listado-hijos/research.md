# Investigación: Home Page — Listado de Hijos

## Decisión: Extender `internal/account` en vez de crear un paquete nuevo

**Decisión**: `GetByID` y `AddChild` se agregan a los archivos ya existentes de `internal/account` (`repository.go`, `service.go`, `handler.go`), no a un paquete nuevo.

**Justificación**: Operan sobre las mismas entidades (`Account`, `Child`) y las mismas reglas de negocio (límite freemium, validación de formato de nombre) que `CreateAccount` ya implementa. Separarlas en otro paquete obligaría a exportar esas reglas o duplicarlas.

**Alternativas consideradas**: Un paquete `internal/home` dedicado a esta feature — rechazado porque no hay ninguna regla de negocio nueva aquí, solo nuevas formas de leer/escribir las mismas entidades; el proyecto ya organiza por dominio (`account`, `catalog`), no por feature de UI.

## Decisión: `AddChild` reutiliza la validación de campos de hijo ya existente, extraída como función compartida

**Decisión**: Extraer de `validateCreateAccountInput` la parte que valida un solo `CreateChildInput` (nombre/apellido/fecha de nacimiento/talla/peso) a una función `validateChildFields(c CreateChildInput) []ValidationError` que devuelve nombres de campo SIN prefijo de índice (`firstName`, no `children[0].firstName`). `validateCreateAccountInput` (creación multi-hijo) sigue envolviendo esos nombres con el prefijo `children[i].`; el nuevo `AddChild` (un solo hijo) los usa tal cual.

**Justificación**: Evita reimplementar las mismas reglas de validación (formato de nombre, fecha no futura, talla/peso positivos) por segunda vez para el caso de "agregar un hijo a una cuenta existente".

**Alternativas consideradas**: Duplicar la validación dentro de `AddChild` — rechazada, es exactamente el tipo de duplicación que ya se identificó como riesgo en el code review de feature 002 (reglas de negocio repetidas que pueden divergir).

## Decisión: `AddChild` reutiliza el límite freemium ya implementado

**Decisión**: `AddChild` cuenta los hijos ya existentes de la cuenta (vía el `Account` devuelto por `GetByID`) y aplica la misma regla que `CreateAccount`: si el resultado excede el límite del plan, devuelve `ErrFreemiumChildLimitExceeded` — el mismo error, mapeado por el handler al mismo `422 freemium_child_limit_exceeded` que el frontend ya sabe manejar (pop-up ya construido en feature 001).

**Justificación**: Un padre podría alcanzar el límite tanto creando 2 hijos de una vez (ya cubierto) como agregando un segundo hijo después desde la home (este caso nuevo) — ambos caminos deben dar exactamente el mismo resultado observable.

**Alternativas consideradas**: Ninguna — es la única forma consistente de mantener la regla de negocio en un solo lugar (Principio de esta constitución sobre DRY implícito en Simplicidad).

## Decisión: `GetByID` devuelve 404 (`ErrAccountNotFound`) si el `account_id` no existe

**Decisión**: Nuevo error de dominio `ErrAccountNotFound`, mapeado por el handler a `404`. El frontend trata esta respuesta igual que "no hay cuenta guardada" (limpia el `account_id` local y muestra la invitación a crear cuenta) — por FR-002 y el primer Caso Límite de spec.md.

**Justificación**: Cubre el escenario donde el `account_id` guardado en el navegador ya no corresponde a ninguna cuenta real (borrada del lado del servidor, o un valor corrupto).

## Decisión: `account_id` en `localStorage`, con manejo defensivo si no está disponible

**Decisión**: Un hook pequeño (`useAccountSession`) centraliza lectura/escritura/limpieza de `localStorage`, envuelto en `try/catch` — si el navegador bloquea `localStorage` (modo privado restrictivo), la app sigue funcionando dentro de la misma pestaña/sesión de React (el estado ya cargado en memoria no se pierde), simplemente no persiste entre visitas.

**Justificación**: Cumple el segundo Caso Límite de spec.md sin necesitar ningún fallback más elaborado (cookies, sessionStorage) — no hay ningún requisito de que la sesión sobreviva a cerrar la pestaña en el peor caso.

## Decisión: `ChildFieldset` se reutiliza directamente desde `features/account-signup/`, sin moverlo a una carpeta compartida

**Decisión**: `features/home/AddChildModal.tsx` importa `ChildFieldset` tal cual desde `features/account-signup/`, en vez de moverlo a `shared/` o duplicarlo.

**Justificación**: Es el mismo formulario con el mismo comportamiento (mismos mensajes de validación, mismos campos) — moverlo a `shared/` sería una reorganización especulativa sin un tercer consumidor todavía (YAGNI, Principio V). Si una tercera feature necesita el mismo formulario más adelante, es el momento natural de promoverlo a `shared/`.

## Decisión: cálculo de edad como utilidad compartida y pura

**Decisión**: `frontend/src/shared/age.ts` exporta una función pura `computeAge(birthDate: string): { value: number; unit: 'meses' | 'años' }`, sin dependencias de red ni de estado — meses si el resultado en años es menor a 2, años completos en caso contrario (Aclaraciones de spec.md).

**Justificación**: Es lógica de presentación reutilizable y trivialmente testeable de forma aislada (sin necesidad de montar ningún componente), y vive en `shared/` desde el inicio porque ya se sabe que es transversal (cualquier pantalla futura que muestre un hijo la va a necesitar, p. ej. la pantalla de detalle de consultas médicas).
