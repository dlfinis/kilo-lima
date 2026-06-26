#!/usr/bin/env node
// Focused test — does navigating to /eventos/:id/productos from / preserve the loaded stores?
import puppeteer from 'puppeteer'
const BASE = 'http://localhost:5173'
const CHROME_PATH = '/Users/diegofernando.leon/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME_PATH,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()

async function snapStores(page, label) {
  const data = await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    if (!pinia) return { error: 'no pinia' }
    const out = {}
    pinia._s.forEach((store, id) => {
      const o = {}
      // Each store has different keys; iterate known state properties
      for (const k of ['eventos', 'productos', 'recetas', 'materiasPrimas', 'ventas', 'carrito']) {
        const v = store[k]
        if (Array.isArray(v)) o[k] = v.length
        else if (v instanceof Map) o[k] = `Map(${v.size})`
        else o[k] = null
      }
      // Specific Map stores
      if (store.productosPorEvento instanceof Map) o.productosPorEvento = `Map(${store.productosPorEvento.size})`
      if (store.gastosPorEvento instanceof Map) o.gastosPorEvento = `Map(${store.gastosPorEvento.size})`
      if (store.planesPorEvento instanceof Map) o.planesPorEvento = `Map(${store.planesPorEvento.size})`
      out[id] = o
    })
    return { url: location.pathname, stores: out }
  })
  console.log(`\n=== ${label} (${data.url}) ===`)
  console.log(JSON.stringify(data.stores, null, 2))
}

// Step 1: warmup at /
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))
await snapStores(page, 'after /')

// Step 2: navigate to /eventos
await page.goto(`${BASE}/eventos`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
await snapStores(page, 'after /eventos')

// Step 3: navigate to /eventos/:id (click into the card)
const card = await page.$('.v-list-item')
if (card) {
  await card.click()
  await new Promise((r) => setTimeout(r, 2000))
  await snapStores(page, 'after /eventos/:id (from card click)')
}

// Step 4: navigate to /eventos/:id/productos
const url = page.url()
const id = url.split('/eventos/')[1]
console.log(`\n>>> Navigating to /eventos/${id}/productos`)
await page.goto(`${BASE}/eventos/${id}/productos`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))
await snapStores(page, 'after /eventos/:id/productos')

// Step 5: inspect the DOM to see if "(producto sin receta)" is shown
const dom = await page.evaluate(() => {
  const t = document.querySelector('[data-testid="evento-productos-tabla"]')
  if (!t) return null
  return Array.from(t.querySelectorAll('tbody tr')).map((r) =>
    Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.trim().slice(0, 60))
  )
})
console.log('\n=== Tabla productos del evento ===')
console.log(JSON.stringify(dom, null, 2))

await browser.close()