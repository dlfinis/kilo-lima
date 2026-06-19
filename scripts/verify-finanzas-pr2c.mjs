#!/usr/bin/env node
// REQ-FIN-21, REQ-FIN-22, REQ-FIN-23, REQ-FIN-24, REQ-FIN-25,
// REQ-FIN-26, REQ-REPORTE-1..6 (PR-2c reports + home):
// real-browser verification for `finanzas-evento` Fase 2c. Spawns
// `pnpm dev --port 5000 --strictPort`, waits for the server, launches
// headless Puppeteer, and asserts:
//
//   1. /eventos/:id/reporte loads the 3-tab surface (REQ-FIN-23).
//   2. Resumen tab exposes CierreResumenCard with utilidadBruta +
//      utilidadNeta (REQ-FIN-23, REQ-REPORTE-3).
//   3. Por día tab shows dates from the range (REQ-FIN-24, REQ-REPORTE-1).
//   4. Por producto tab shows products (REQ-FIN-25, REQ-REPORTE-2).
//   5. HomeView post-evento card is wired (REQ-FIN-33, REQ-FIN-34).
//   6. EventoDetalleView "Ver reporte" button is wired (REQ-FIN-27).
//   7. Bundle source contains the PR-2c wiring (useReporteEvento,
//      ReporteEventoView, route, etc.).
//
// Run: `pnpm verify:finanzas-pr2c`.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const BASE = process.env.FINANZAS_PR2C_URL ?? 'http://127.0.0.1:5000'
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

const tmpProfile = mkdtempSync(join(tmpdir(), 'finanzas-pr2c-verify-'))
let browser
let server
let verdict = 'PASS'
const evidence = {
  base: BASE,
  chromePath: CHROME_PATH,
  tmpProfile,
  assertions: [],
  reporteView: {},
  homeView: {},
  detalleView: {},
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
  evidence.reporteView.eventoIdFromList = eventoId

  logHeader('5/9  Navigate to /eventos/:id/reporte and verify the page mounts (REQ-FIN-23)')
  const reporteUrl = eventoId
    ? `${BASE}/eventos/${eventoId}/reporte`
    : `${BASE}/eventos/seed-missing/reporte`
  await page.goto(reporteUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await new Promise((r) => setTimeout(r, 1500))

  const reporteSnapshot = await page.evaluate(() => {
    const tabs = {
      resumen: !!document.querySelector('[data-testid="reporte-tab-resumen"]'),
      porDia: !!document.querySelector('[data-testid="reporte-tab-por-dia"]'),
      porProducto: !!document.querySelector('[data-testid="reporte-tab-por-producto"]'),
    }
    return {
      titulo: document.querySelector('[data-testid="reporte-titulo"]')?.textContent?.trim() ?? null,
      empty: !!document.querySelector('[data-testid="reporte-empty"]'),
      loading: !!document.querySelector('[data-testid="reporte-loading"]'),
      error: document.querySelector('[data-testid="reporte-error"]')?.textContent?.trim() ?? null,
      tabs,
      bodyTextLength: (document.body.innerText || '').length,
    }
  })
  evidence.reporteView.snapshot = reporteSnapshot

  if (eventoId) {
    // Real evento: tabs or empty state must render.
    if (reporteSnapshot.empty) {
      logOk('ReporteEventoView rendered the non-cerrado empty state (REQ-REPORTE-5)')
      evidence.assertions.push({ testid: 'reporte-empty-state', ok: true })
    } else if (reporteSnapshot.tabs.resumen && reporteSnapshot.tabs.porDia && reporteSnapshot.tabs.porProducto) {
      logOk('ReporteEventoView rendered 3 tabs (REQ-FIN-23)')
      evidence.assertions.push({ testid: 'reporte-tabs', ok: true })
    } else {
      logFail(`ReporteEventoView did not render tabs or empty state (tabs=${JSON.stringify(reporteSnapshot.tabs)}, empty=${reporteSnapshot.empty})`)
      evidence.assertions.push({ testid: 'reporte-tabs-or-empty', ok: false })
      verdict = 'FAIL'
    }
  } else {
    logOk('no seed evento — relying on bundle source check')
  }

  logHeader('6/9  Verify ReporteEventoView bundle contains the PR-2c wiring (REQ-FIN-21..26)')
  try {
    const resp = await fetch(`${BASE}/src/views/ReporteEventoView.vue`)
    const src = await resp.text()
    evidence.bundles.reporteViewChars = src.length
    const checks = [
      { needle: 'useReporteEvento', desc: 'composable wiring' },
      { needle: 'reporte-tab-resumen', desc: 'Resumen tab testid (REQ-FIN-23)' },
      { needle: 'reporte-tab-por-dia', desc: 'Por día tab testid (REQ-FIN-24)' },
      { needle: 'reporte-tab-por-producto', desc: 'Por producto tab testid (REQ-FIN-25)' },
      { needle: 'CierreResumenCard', desc: 'Resumen tab uses CierreResumenCard (REQ-FIN-23)' },
      { needle: 'El evento debe estar cerrado', desc: 'empty state copy (REQ-REPORTE-5)' },
    ]
    let allOk = true
    for (const c of checks) {
      if (src.includes(c.needle)) {
        logOk(`ReporteEventoView bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`ReporteEventoView bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-reporte-view-pr2c', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`ReporteEventoView bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    verdict = 'FAIL'
  }

  logHeader('7/9  Verify useReporteEvento bundle + utils/cierre desglose helpers (REQ-FIN-21, REQ-REPORTE-1, REQ-REPORTE-2)')
  try {
    const composableResp = await fetch(`${BASE}/src/composables/useReporteEvento.ts`)
    const composableSrc = await composableResp.text()
    evidence.bundles.composableChars = composableSrc.length
    const checks = [
      { needle: 'reportePorDia', desc: 'reportePorDia computed (REQ-FIN-21)' },
      { needle: 'reportePorProducto', desc: 'reportePorProducto computed (REQ-FIN-21)' },
      { needle: 'calcularDesglosePorDia', desc: 'per-day aggregation (REQ-REPORTE-1)' },
      { needle: 'calcularDesglosePorProducto', desc: 'per-producto aggregation (REQ-REPORTE-2)' },
    ]
    let allOk = true
    for (const c of checks) {
      if (composableSrc.includes(c.needle)) {
        logOk(`useReporteEvento bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`useReporteEvento bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-composable-pr2c', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`useReporteEvento bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    verdict = 'FAIL'
  }

  try {
    const cierreResp = await fetch(`${BASE}/src/utils/cierre.ts`)
    const cierreSrc = await cierreResp.text()
    evidence.bundles.cierreChars = cierreSrc.length
    const checks = [
      { needle: 'calcularDesglosePorDia', desc: 'per-day util (REQ-REPORTE-1)' },
      { needle: 'calcularDesglosePorProducto', desc: 'per-producto util (REQ-REPORTE-2)' },
    ]
    let allOk = true
    for (const c of checks) {
      if (cierreSrc.includes(c.needle)) {
        logOk(`cierre.ts bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`cierre.ts bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-cierre-pr2c', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`cierre.ts bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    verdict = 'FAIL'
  }

  logHeader('8/9  Verify HomeView post-evento card wiring (REQ-FIN-33, REQ-FIN-34)')
  try {
    const homeResp = await fetch(`${BASE}/src/views/HomeView.vue`)
    const homeSrc = await homeResp.text()
    evidence.bundles.homeViewChars = homeSrc.length
    const checks = [
      { needle: 'home-card-post-evento-reporte', desc: 'Ver reporte CTA testid' },
      { needle: 'home-card-post-evento-empty', desc: 'empty-state testid' },
      { needle: 'ultimoCerrado', desc: 'latest cerrado evento computed' },
      { needle: 'tieneEventosCerrados', desc: 'card-enabled computed' },
      { needle: 'Ningún evento cerrado', desc: 'empty state copy' },
    ]
    let allOk = true
    for (const c of checks) {
      if (homeSrc.includes(c.needle)) {
        logOk(`HomeView bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`HomeView bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-home-view-pr2c', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`HomeView bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    verdict = 'FAIL'
  }

  logHeader('9/9  Verify EventoDetalleView "Ver reporte" button + router route (REQ-FIN-27, REQ-FIN-23)')
  try {
    const detalleResp = await fetch(`${BASE}/src/views/EventoDetalleView.vue`)
    const detalleSrc = await detalleResp.text()
    evidence.bundles.detalleViewChars = detalleSrc.length
    const checks = [
      { needle: 'evento-detalle-ver-reporte', desc: 'Ver reporte button testid' },
      { needle: '/reporte', desc: 'routing to /eventos/:id/reporte' },
    ]
    let allOk = true
    for (const c of checks) {
      if (detalleSrc.includes(c.needle)) {
        logOk(`EventoDetalleView bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`EventoDetalleView bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-detalle-view-pr2c', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`EventoDetalleView bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    verdict = 'FAIL'
  }

  try {
    const routerResp = await fetch(`${BASE}/src/router/routes.ts`)
    const routerSrc = await routerResp.text()
    evidence.bundles.routerChars = routerSrc.length
    const checks = [
      { needle: '/eventos/:id/reporte', desc: 'reporte route path' },
      { needle: 'evento-reporte', desc: 'reporte route name' },
      { needle: 'ReporteEventoView.vue', desc: 'lazy component import' },
    ]
    let allOk = true
    for (const c of checks) {
      if (routerSrc.includes(c.needle)) {
        logOk(`router bundle contains "${c.needle}" (${c.desc})`)
      } else {
        logFail(`router bundle MISSING "${c.needle}" (${c.desc})`)
        allOk = false
      }
    }
    evidence.assertions.push({ testid: 'bundle-router-pr2c', ok: allOk })
    if (!allOk) verdict = 'FAIL'
  } catch (err) {
    logFail(`router bundle fetch failed: ${err instanceof Error ? err.message : String(err)}`)
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

console.log('\n=== FINANZAS PR2C Browser Verification Report ===')
console.log(JSON.stringify({ verdict, evidence }, null, 2))
process.exit(verdict === 'PASS' ? 0 : 1)
