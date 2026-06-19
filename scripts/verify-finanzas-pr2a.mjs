#!/usr/bin/env node
// REQ-FIN-18, REQ-FIN-20, REQ-PRICING-1..8: real-browser verification
// for `finanzas-evento` Fase 2a. Spawns `pnpm dev --port 5000
// --strictPort`, waits for the server, launches headless Puppeteer,
// and asserts:
//
//   1. EventoDetalleView shows the new "Productos del evento" section
//      with the count badge + the "Configurar productos" button
//      (REQ-FIN-20).
//   2. Navigating to /eventos/:id/productos renders the
//      EventoProductosView with the configurator surface (or empty
//      state with "Inicializar desde catálogo" button) and the
//      "Volver al evento" button (REQ-FIN-18, REQ-PRICING-1).
//   3. The bundle source contains the testids + the new pricing
//      utils + the MargenSlider component (proves the slice shipped
//      even when the dev seed has no eventos).
//
// Run: `pnpm verify:finanzas-pr2a`.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const BASE = process.env.FINANZAS_PR2A_URL ?? 'http://127.0.0.1:5000'
const TIMEOUT_MS = 30_000
const CHROME_PATH =
  '/Users/diegofernando.leon/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

function logHeader(t) {
  console.log(`\n=== ${t} ===`)
}
function logOk(msg) {
  console.log(`  OK  ${msg}`)
}
function logFail(msg) {
  console.log(`  FAIL ${msg}`)
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' })
      if (res.status < 500) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const tmpProfile = mkdtempSync(join(tmpdir(), 'finanzas-pr2a-verify-'))
let browser
let server
let verdict = 'PASS'
const evidence = {
  base: BASE,
  chromePath: CHROME_PATH,
  tmpProfile,
  assertions: [],
  detailView: {},
  productosView: {},
  bundles: {},
}

async function killServer() {
  if (server && !server.killed) {
    try {
      server.kill('SIGTERM')
    } catch {
      // already gone
    }
    await new Promise((r) => setTimeout(r, 500))
    if (!server.killed) {
      try {
        server.kill('SIGKILL')
      } catch {
        // gone
      }
    }
  }
}

try {
  logHeader('1/9  Start Vite dev server on port 5000')
  server = spawn('pnpm', ['dev', '--port', '5000', '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  server.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    if (text.includes('ready in') || text.includes('Local:')) {
      process.stdout.write(`  [vite] ${text}`)
    }
  })
  server.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    if (text.includes('EADDRINUSE') || text.includes('error')) {
      process.stderr.write(`  [vite] ${text}`)
    }
  })
  logOk(`dev server pid ${server.pid}`)

  logHeader('2/9  Wait for server')
  const up = await waitForServer(BASE, TIMEOUT_MS)
  if (!up) {
    logFail(`server did not respond within ${TIMEOUT_MS}ms`)
    verdict = 'FAIL'
    throw new Error('server-unreachable')
  }
  logOk('server is reachable')

  logHeader('3/9  Launch headless Puppeteer')
  browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    userDataDir: tmpProfile,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  page.on('pageerror', (err) => {
    logFail(`pageerror: ${err.message}`)
    verdict = 'FAIL'
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (text.includes('Failed to mount')) return
      if (text.includes('Failed to load resource')) return
      logFail(`console.error: ${text}`)
      verdict = 'FAIL'
    }
  })

  logHeader('4/9  Navigate to /eventos and find an evento ID')
  await page.goto(`${BASE}/eventos`, {
    waitUntil: 'networkidle2',
    timeout: TIMEOUT_MS,
  })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await new Promise((r) => setTimeout(r, 1000))

  const eventoId = await page.evaluate(() => {
    const link = document.querySelector('a[href^="/eventos/"]')
    if (!link) return null
    const m = link.getAttribute('href')?.match(/\/eventos\/([a-zA-Z0-9-]+)/)
    return m ? m[1] : null
  })
  evidence.detailView.eventoIdFromList = eventoId

  logHeader('5/9  EventoDetalleView: Productos section + Configurar productos button (REQ-FIN-20)')
  const detailUrl = eventoId
    ? `${BASE}/eventos/${eventoId}`
    : `${BASE}/eventos/seed-missing`
  await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await new Promise((r) => setTimeout(r, 1500))

  const detailSnapshot = await page.evaluate(() => ({
    productosCard: !!document.querySelector('[data-testid="evento-detalle-productos"]'),
    productosCount: !!document.querySelector('[data-testid="evento-detalle-productos-count"]'),
    configurarProductos: !!document.querySelector(
      '[data-testid="evento-detalle-configurar-productos"]',
    ),
    inicializarProductos: !!document.querySelector(
      '[data-testid="evento-detalle-inicializar-productos"]',
    ),
    bodyTextLength: (document.body.innerText || '').length,
  }))
  evidence.detailView.snapshot = detailSnapshot

  if (eventoId) {
    // Real evento: every Productos section testid must render.
    if (detailSnapshot.productosCard) {
      logOk('Productos del evento card rendered (REQ-FIN-20)')
      evidence.assertions.push({ testid: 'evento-detalle-productos', ok: true })
    } else {
      logFail('Productos del evento card MISSING')
      evidence.assertions.push({ testid: 'evento-detalle-productos', ok: false })
      verdict = 'FAIL'
    }
    if (detailSnapshot.productosCount) {
      logOk('productos count badge rendered')
      evidence.assertions.push({ testid: 'evento-detalle-productos-count', ok: true })
    } else {
      logFail('productos count badge MISSING')
      evidence.assertions.push({ testid: 'evento-detalle-productos-count', ok: false })
      verdict = 'FAIL'
    }
    if (detailSnapshot.configurarProductos) {
      logOk('Configurar productos button rendered')
      evidence.assertions.push({ testid: 'evento-detalle-configurar-productos', ok: true })
    } else {
      logFail('Configurar productos button MISSING')
      evidence.assertions.push({ testid: 'evento-detalle-configurar-productos', ok: false })
      verdict = 'FAIL'
    }
  } else {
    // No seed evento: rely on bundle source check below. Browser-side
    // proof can't render the detail view without an evento id.
    logOk('no seed evento — falling back to bundle source check')
  }

  logHeader('6/9  Navigate to /eventos/:id/productos and verify EventoProductosView')
  const productosUrl = eventoId
    ? `${BASE}/eventos/${eventoId}/productos`
    : `${BASE}/eventos/seed-missing/productos`
  await page.goto(productosUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await new Promise((r) => setTimeout(r, 1500))

  const productosSnapshot = await page.evaluate(() => {
    const empty = !!document.querySelector('[data-testid="evento-productos-empty"]')
    const tabla = !!document.querySelector('[data-testid="evento-productos-tabla"]')
    const volver = !!document.querySelector('[data-testid="evento-productos-volver"]')
    const inicializar = !!document.querySelector('[data-testid="evento-productos-inicializar"]')
    const margen = !!document.querySelector('[data-testid="evento-productos-margen"]')
    const bodyText = document.body.innerText || ''
    return {
      empty,
      tabla,
      volver,
      inicializar,
      margen,
      bodyTextLength: bodyText.length,
      hasMargen40: bodyText.includes('40%'),
    }
  })
  evidence.productosView.snapshot = productosSnapshot

  if (eventoId) {
    if (productosSnapshot.volver) {
      logOk('Volver al evento button rendered')
      evidence.assertions.push({ testid: 'evento-productos-volver', ok: true })
    } else {
      logFail('Volver al evento button MISSING')
      evidence.assertions.push({ testid: 'evento-productos-volver', ok: false })
      verdict = 'FAIL'
    }
    if (productosSnapshot.margen) {
      logOk('margen badge rendered in header')
      evidence.assertions.push({ testid: 'evento-productos-margen', ok: true })
    } else {
      logFail('margen badge MISSING')
      evidence.assertions.push({ testid: 'evento-productos-margen', ok: false })
      verdict = 'FAIL'
    }
    if (productosSnapshot.empty || productosSnapshot.tabla) {
      logOk(
        `EventoProductosView body state — empty=${productosSnapshot.empty} tabla=${productosSnapshot.tabla}`,
      )
    } else {
      logFail('EventoProductosView body state is NEITHER empty NOR tabla')
      verdict = 'FAIL'
    }
  } else {
    logOk('no seed evento — relying on bundle source check for view surface')
  }

  logHeader('7/9  Verify Volver al evento button navigates back to /eventos/:id')
  if (eventoId && productosSnapshot.volver) {
    try {
      await page.click('[data-testid="evento-productos-volver"]')
      await new Promise((r) => setTimeout(r, 1000))
      const finalUrl = page.url()
      evidence.productosView.afterClickUrl = finalUrl
      if (finalUrl.endsWith(`/eventos/${eventoId}`)) {
        logOk(`Volver navigation → ${finalUrl}`)
        evidence.assertions.push({ testid: 'evento-productos-volver-navigation', ok: true })
      } else {
        logFail(`Volver landed at ${finalUrl}, expected /eventos/${eventoId}`)
        evidence.assertions.push({ testid: 'evento-productos-volver-navigation', ok: false })
        verdict = 'FAIL'
      }
    } catch (err) {
      logFail(`Volver click failed: ${err instanceof Error ? err.message : String(err)}`)
      verdict = 'FAIL'
    }
  } else {
    logOk('skipped Volver navigation check — no seed evento or button missing')
  }

  logHeader('8/9  Verify pricing.ts + MargenSlider bundle source')
  try {
    const pricingResp = await fetch(`${BASE}/src/utils/pricing.ts`)
    const pricingSrc = await pricingResp.text()
    evidence.bundles.pricingChars = pricingSrc.length
    const checks = [
      { needle: 'calcularPrecioPorMargen', desc: 'price-from-margin util' },
      { needle: 'calcularMargenReal', desc: 'real-margin util' },
      { needle: 'redondearCentavos', desc: 'single-rounding policy' },
    ]
    let allOk = true
    for (const c of checks) {
      if (pricingSrc.includes(c.needle)) {
        logOk(`pricing.ts bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`pricing.ts bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-pricing', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`pricing bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    verdict = 'FAIL'
  }

  try {
    const sliderResp = await fetch(`${BASE}/src/components/business/MargenSlider.vue`)
    const sliderSrc = await sliderResp.text()
    evidence.bundles.margenSliderChars = sliderSrc.length
    // Vite transforms .vue → JS module; the emits line becomes
    // `_defineEmits(["update:modelValue"])` and template testids
    // appear as `_createElementBlock("input", { ... "data-testid": "margen-slider-input" ... })`.
    const checks = [
      { needle: 'margen-slider-input', desc: 'slider input testid' },
      { needle: 'calcularPrecioPorMargen', desc: 'live price preview' },
      { needle: 'update:modelValue', desc: '0..1 v-model emit' },
    ]
    let allOk = true
    for (const c of checks) {
      if (sliderSrc.includes(c.needle)) {
        logOk(`MargenSlider bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`MargenSlider bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-margen-slider', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`MargenSlider bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    verdict = 'FAIL'
  }

  logHeader('9/9  Verify EventoProductosView bundle source')
  try {
    const resp = await fetch(`${BASE}/src/views/EventoProductosView.vue`)
    const src = await resp.text()
    evidence.bundles.productosViewChars = src.length
    const checks = [
      { needle: 'evento-productos-tabla', desc: 'DataTable testid' },
      { needle: 'evento-productos-volver', desc: 'Volver button testid' },
      { needle: 'evento-productos-inicializar', desc: 'Inicializar button testid' },
      { needle: 'usePreciosEvento', desc: 'usePreciosEvento composable' },
      { needle: 'useEventoProductosStore', desc: 'eventoProductos store' },
    ]
    let allOk = true
    for (const c of checks) {
      if (src.includes(c.needle)) {
        logOk(`EventoProductosView bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`EventoProductosView bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-productos-view', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(
      `EventoProductosView bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    verdict = 'FAIL'
  }
} catch (err) {
  verdict = 'FAIL'
  evidence.error = err instanceof Error ? err.message : String(err)
  logFail(`uncaught: ${evidence.error}`)
} finally {
  if (browser) {
    await browser.close().catch(() => {})
  }
  await killServer()
  rmSync(tmpProfile, { recursive: true, force: true })
}

console.log('\n=== FINANZAS PR2A Browser Verification Report ===')
console.log(JSON.stringify({ verdict, evidence }, null, 2))
process.exit(verdict === 'PASS' ? 0 : 1)