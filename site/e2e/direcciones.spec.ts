import { expect, test } from '@playwright/test'

// Las direcciones como las sirve Cloudflare Pages (el plugin de `vite preview` las imita): cada página es `<ruta>.html`, así que
// `/<ruta>` responde 200 sin redirigir, y `/<ruta>/` y `/<ruta>.html` pasan a `/<ruta>` con 308 (nunca un ciclo).

test('/planes responde 200 sin redirigir', async ({ request }) => {
  const response = await request.get('/planes', { maxRedirects: 0 })
  expect(response.status()).toBe(200)
})

for (const from of ['/planes/', '/planes.html', '/index.html']) {
  test(`${from} pasa a su dirección canónica con 308`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(from === '/index.html' ? '/' : '/planes')
  })
}

test('seguir las redirecciones de /planes/ termina en 200', async ({ request }) => {
  const response = await request.get('/planes/')
  expect(response.status()).toBe(200)
  expect(response.url()).toMatch(/\/planes$/)
})

test('una dirección que no existe responde 404', async ({ request }) => {
  expect((await request.get('/no-existe')).status()).toBe(404)
})
