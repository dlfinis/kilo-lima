#!/usr/bin/env node
// Even more focused — direct nav to evento productos, monitor network and store changes
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

// Capture all network requests to Supabase
const requests = []
page.on('request', (req) => {
  const url = req.url()
  if (url.includes('supabase')) {
    requests.push({ method: req.method(), url: url.split('?')[0].split('.co/')[1] || url, postData: req.postData()?.slice(0, 200) })
  }
})

async function snapStores(page, label) {
  const data = await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    if (!pinia) return { error: 'no pinia' }
    const out = {}
    pinia._s.forEach((store, id) => {
      const o = {}
      if (Array.isArray(store.recetas)) o.recetas = store.recetas.length
      if (Array.isArray(store.productos)) o.productos = store.productos.length
      if (Array.isArray(store.materiasPrimas)) o.materiasPrimas = store.materiasPrimas.length
      if (Array.isArray(store.eventos)) o.eventos = store.eventos.length
      out[id] = o
    })
    return { url: location.pathname, stores: out }
  })
  console.log(`\n=== ${label} (${data.url}) ===`)
  console.log(JSON.stringify(data.stores, null, 2))
}

// Step 1: warmup at /
console.log('--- Step 1: warmup at / ---')
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 3000))
await snapStores(page, 'after /')

// Reset request log
const reqBeforeNav = requests.length

// Step 2: direct nav to /eventos/:id/productos
console.log('\n--- Step 2: direct nav /eventos/:id/productos ---')
await page.goto(`${BASE}/eventos/68d65441-c2de-4fe9-8672-67e2267d3b7f/productos`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 3000))
await snapStores(page, 'after direct nav')

console.log('\n--- Network requests during nav ---')
for (const r of requests.slice(reqBeforeNav)) {
  console.log(`  ${r.method} ${r.url}`)
}

await browser.close()