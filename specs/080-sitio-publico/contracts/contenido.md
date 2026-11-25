# Contrato: archivos de contenido que edita el dueño

Todo se lee al compilar; un error de formato detiene la compilación con el archivo y la línea.

## `site/content/blog/<slug>.md`

```markdown
---
title: Cómo organizar las recetas de tus hijos | PediTrack
description: Un método simple para guardar cada receta, su fecha y sus medicamentos por hijo…
datePublished: 2026-12-01
dateModified: 2026-12-01
ready: false
---

Texto del artículo en Markdown (## para secciones, listas, enlaces a /funciones o /planes).
```

- `ready: true` lo publica; el aviso «Esta guía es de organización; no es un consejo médico» lo agrega la plantilla.
- Los tres primeros slugs: `organizar-recetas-hijos`, `no-olvidar-tomas-antibiotico`, `que-llevar-consulta-pediatra` (tabla de SEO del mock).

## `site/content/site.json`

```json
{
  "contactEmail": "",
  "privacyEmail": "",
  "social": { "facebook": "", "instagram": "" },
  "appOrigin": "https://app.pedi-track.com"
}
```

## `legal/*.md` y `legal/estado.json`

- `legal/privacidad-y-seguridad.md`, `legal/aviso-de-privacidad.md`, `legal/terminos-y-condiciones.md`: `# Título`, un bloque `>` de borrador (no se publica), `## Sección` por cada entrada del índice «Contenido».
- `legal/estado.json`: `{ "reviewedByLawyer": false, "date": null }`.

## `site/content/faq.ts`

Se edita en código (las respuestas ya vienen del mock); cambiar una respuesta cambia a la vez la página, el inicio y el JSON-LD.
