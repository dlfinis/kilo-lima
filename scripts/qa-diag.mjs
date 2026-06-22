#!/usr/bin/env node
// Diagnóstico dirigido al bug "(producto sin receta)" en F + POS grid vacío en G
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
page.on('pageerror', (err) => console.log(`[PAGEERROR] ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log(`[CONSOLE.ERR] ${msg.text().slice(0, 200)}`)
})

async function inspectStores(page, label) {
  // Access Pinia state via window if exposed; otherwise navigate and observe
  const data = await page.evaluate(() => {
    const out = { testids: [], errors: [], productCards: [], productoCardNames: [] }
    document.querySelectorAll('[data-testid="producto-card"]').forEach((c) => {
      out.productCards.push({
        text: c.textContent?.trim().slice(0, 100),
        nombre: c.querySelector('.text-h6')?.textContent?.trim(),
      })
    })
    out.productoCardNames = out.productCards.map((p) => p.nombre)
    return out
  })
  console.log(`[${label}]`, JSON.stringify(data, null, 2))
}

// 1. Start at home (load all stores via useResumen)
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
console.log('\n=== Step 1: At home, all stores should be loaded ===')
await inspectStores(page, 'home')

// 2. Navigate to /recetas to verify recetas load
await page.goto(`${BASE}/recetas`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1000))
const recetas = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.v-list-item'))
  return items.map((i) => i.textContent?.trim().slice(0, 100))
})
console.log('\n=== Step 2: /recetas loaded items ===')
console.log(JSON.stringify(recetas, null, 2))

// 3. Click into first receta to verify detalle + ingredientes
const firstReceta = await page.$('[data-testid^="receta-row-"]')
if (firstReceta) {
  await firstReceta.click()
  await new Promise((r) => setTimeout(r, 800))
  const detalle = await page.evaluate(() => {
    const title = document.querySelector('[data-testid="receta-detalle-titulo"]')?.textContent?.trim()
    const breakdown = document.querySelector('[data-testid="receta-costo-desglose"], .receta-costo, [class*="desglose"]')?.textContent?.trim() || 'NO DESGLOSE FOUND'
    const allText = document.body.innerText.slice(0, 2000)
    return { title, breakdown, allText }
  })
  console.log('\n=== Step 3: Receta detalle ===')
  console.log(JSON.stringify(detalle, null, 2))
}

// 4. Navigate directly to /eventos/:id/productos without going through eventos list
const eventoId = '68d65441-c2de-4fe9-8672-67e2267d3b7f'
await page.goto(`${BASE}/eventos/${eventoId}/productos`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
const tabla = await page.evaluate(() => {
  const t = document.querySelector('[data-testid="evento-productos-tabla"]')
  if (!t) return { found: false }
  return {
    found: true,
    headers: Array.from(t.querySelectorAll('th')).map((h) => h.textContent?.trim()),
    rows: Array.from(t.querySelectorAll('tbody tr')).map((r) =>
      Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.trim().slice(0, 80))
    ),
  }
})
console.log('\n=== Step 4: /eventos/:id/productos direct nav ===')
console.log(JSON.stringify(tabla, null, 2))

// 5. Inspect recipes store via window (after Pinia plugins expose)
const recipesInfo = await page.evaluate(() => {
  // Try to access Pinia through Vue devtools global
  const app = document.querySelector('#app').__vue_app__
  const pinia = app.config.globalProperties.$pinia
  if (!pinia) return { error: 'pinia not exposed' }
  const state = {}
  pinia._s.forEach((store, id) => {
    state[id] = {
      recetasLength: store.recetas?.length,
      productosLength: store.productos?.length,
      eventosLength: store.eventos?.length,
      primerasRecetas: store.recetas?.slice(0, 2).map((r) => ({ id: r.id, nombre: r.nombre, ingCount: r.ingredientes?.length })),
      primerosProductos: store.productos?.slice(0, 3).map((p) => ({ id: p.id, receta_id: p.receta_id })),
    }
  })
  return state
})
console.log('\n=== Step 5: Pinia state inspection ===')
console.log(JSON.stringify(recipesInfo, null, 2))

// 6. Now navigate to /pos
await page.goto(`${BASE}/pos`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
const posState = await page.evaluate(() => {
  const gridCol = document.querySelector('[data-testid="pos-grid-col"]')
  const noEventAlert = document.querySelector('[data-testid="pos-sin-evento"]')
  const emptyEvent = document.querySelector('[data-testid="pos-evento-sin-productos"]')
  const productsGrid = document.querySelector('[data-testid="productos-grid"]')
  const cards = document.querySelectorAll('[data-testid="producto-card"]')
  return {
    gridColVisible: !!gridCol,
    noEventAlert: !!noEventAlert,
    emptyEventAlert: !!emptyEvent,
    productsGrid: !!productsGrid,
    cardCount: cards.length,
    cardContents: Array.from(cards).map((c) => c.textContent?.trim().slice(0, 150)),
    fullText: document.body.innerText.slice(0, 1500),
  }
})
console.log('\n=== Step 6: /pos state ===')
console.log(JSON.stringify(posState, null, 2))

// 7. Pinia state at /pos
const recipesAtPos = await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__
  const pinia = app.config.globalProperties.$pinia
  if (!pinia) return { error: 'no pinia' }
  const recipesStore = pinia._s.get('recipes')
  return {
    recetas: recipesStore?.recetas?.map((r) => ({ id: r.id, nombre: r.nombre, ingCount: r.ingredientes?.length })),
  }
})
console.log('\n=== Step 7: recipes store at /pos ===')
console.log(JSON.stringify(recipesAtPos, null, 2))

await browser.close()
console.log('\n=== DONE ===')