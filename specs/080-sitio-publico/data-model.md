# Modelo de datos: Sitio público (spec 080)

El sitio no tiene base de datos ni API: sus «datos» son archivos de contenido que se leen al compilar. Formatos exactos en [contracts/contenido.md](contracts/contenido.md).

## Página (`site/src/pages.ts`, una entrada por ruta)

| Campo | Tipo | Regla |
|---|---|---|
| `path` | texto | Empieza con `/`, en minúsculas, sin barra final (salvo `/`); única |
| `title` | texto | ≤ 60 caracteres (FR-018); el de la tabla de SEO del mock |
| `description` | texto | ≤ 155 caracteres |
| `h1` | texto | Exactamente uno por página; el de la tabla de SEO |
| `schema` | lista | De `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`, `WebPage`, `CollectionPage`, `Article` |
| `index` | sí/no | `false` solo en la 404 (y en todas en la vista previa) |
| `ogImage` | ruta | `/og/<nombre>.png`, 1200×630; existe en `site/public/og/` |
| `breadcrumbs` | lista | `[{name, path}]`; vacía en `/` y en la 404 |
| `component` | componente | La página React que se convierte a HTML |

Rutas: `/`, `/funciones`, `/planes`, `/preguntas-frecuentes`, `/instalar`, `/privacidad`, `/aviso-de-privacidad`, `/terminos`, `/blog` (solo con artículos listos), `/blog/<slug>` y `404`.

## Artículo del blog (`site/content/blog/<slug>.md`)

| Campo | Regla |
|---|---|
| `slug` | El nombre del archivo; `[a-z0-9-]+` |
| `title` | ≤ 60 con « \| PediTrack» incluido |
| `description` | ≤ 155 |
| `datePublished`, `dateModified` | Fechas reales `AAAA-MM-DD`; `dateModified ≥ datePublished` |
| `ready` | `true` para publicarse; sin ningún `true` no existe `/blog` |
| cuerpo | Markdown; debe incluir el aviso de que no es consejo médico (lo pone la plantilla, no el autor) |

## Pregunta frecuente (`site/content/faq.ts`)

`{ id, topic, question, answer, home: boolean }`: 15 preguntas en 5 temas (Sobre PediTrack, Planes y pagos, Instalación y uso, Familia, Tus datos); 6 con `home: true` salen en el inicio; la primera de la página va abierta. `answer` es texto plano (va igual en el HTML y en el JSON-LD).

## Plan (`site/content/plans.ts`)

`{ name, price, period, includes[], excludes[] }` para «Gratis» (MX$0) y «Plan completo» (MX$499 al año). Una prueba lo compara con `frontend/src/features/plans/planCopy.ts`.

## Ajustes del sitio (`site/content/site.json`)

`{ contactEmail, privacyEmail, social: { facebook?, instagram? }, appOrigin }`. `appOrigin` = `https://app.pedi-track.com` (en la vista previa, la app de DEV). En producción `contactEmail` y `privacyEmail` son obligatorios (R10).

## Estado legal (`legal/estado.json`)

`{ reviewedByLawyer: boolean, date: "AAAA-MM-DD" | null }`. Producción exige `true`.

## Contenido pendiente (no es un archivo: es la salida de la revisión de producción)

Lista de lo que falta, cada una con su archivo: corchetes en el HTML generado, correo de contacto, revisión legal. Las redes sociales y el blog no bloquean.
