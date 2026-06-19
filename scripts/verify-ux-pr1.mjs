#!/usr/bin/env node
// REQ-UX-27: real-browser verification for PR1 (navigation shell).
// Spawns `pnpm dev --port 5000 --strictPort`, waits for the server,
// launches headless Puppeteer, then drives:
//
//   1. Navigate / — AppBar present, brand "Kilo-Lima", breadcrumb
//      shows Inicio, back button HIDDEN (REQ-UX-2).
//   2. Navigate /materias-primas — back button VISIBLE,
//      breadcrumb shows Inicio / Materias primas (REQ-UX-5/6).
//   3. Click the back button — URL returns to /.
//
// Every assertion exits non-zero on FAIL so CI catches regressions.
// Run: `pnpm verify:ux-pr1`.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const URL = process.env.UX_PR1_URL ?? 'http://127.0.0.1:5000/'
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

const tmpProfile = mkdtempSync(join(tmpdir(), 'ux-pr1-verify-'))
let browser
let server
let verdict = 'PASS'
const evidence = {
  url: URL,
  chromePath: CHROME_PATH,
  tmpProfile,
  assertions: [],
  mountCheck: null,
  finalUrl: null,
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

const assertacion = async (page, testid, presente) => {
  const existe = await page.evaluate((sel) => !!document.querySelector(`[data-testid="${sel}"]`), testid)
  const ok = existe === presente
  return { testid, presente, existe, ok }
}

try {
  logHeader('1/7  Start Vite dev server on port 5000')
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

  logHeader('2/7  Wait for server')
  const up = await waitForServer(URL, TIMEOUT_MS)
  if (!up) {
    logFail(`server did not respond within ${TIMEOUT_MS}ms`)
    verdict = 'FAIL'
    throw new Error('server-unreachable')
  }
  logOk('server is reachable')

  logHeader('3/7  Launch headless Puppeteer')
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
    if (msg.type() === 'log' && msg.text().includes('[useNavegacion]')) {
      process.stdout.write(`  [browser] ${msg.text()}\n`)
    }
  })

  logHeader('4/7  Navigate / — assert AppBar present + back hidden')
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="app-bar"]', { timeout: TIMEOUT_MS })
  const mountInfo = await page.evaluate(() => {
    const root = document.querySelector('#app')
    return {
      hasChildren: !!root && root.children.length > 0,
      childCount: root ? root.children.length : 0,
    }
  })
  evidence.mountCheck = mountInfo
  logOk(`#app mounted with ${mountInfo.childCount} children`)

  const barraPresente = await assertacion(page, 'app-bar', true)
  evidence.assertions.push(barraPresente)
  if (barraPresente.ok) logOk('app-bar present on /')
  else { logFail('app-bar MISSING on /'); verdict = 'FAIL' }

  const volverOcultoEnRoot = await assertacion(page, 'app-bar-back', false)
  evidence.assertions.push(volverOcultoEnRoot)
  if (volverOcultoEnRoot.ok) logOk('back button hidden on /')
  else { logFail('back button VISIBLE on / (should be hidden)'); verdict = 'FAIL' }

  const breadcrumbRoot = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="breadcrumb-nav"]')
    return nav ? nav.textContent : ''
  })
  if (breadcrumbRoot && breadcrumbRoot.includes('Inicio')) {
    logOk(`breadcrumb on / contains Inicio: "${breadcrumbRoot.trim()}"`)
    evidence.assertions.push({ testid: 'breadcrumb-inicio', presente: true, ok: true, texto: breadcrumbRoot.trim() })
  } else {
    logFail(`breadcrumb on / missing Inicio: "${breadcrumbRoot}"`)
    evidence.assertions.push({ testid: 'breadcrumb-inicio', presente: false, ok: false, texto: breadcrumbRoot })
    verdict = 'FAIL'
  }

  logHeader('5/7  Navigate /materias-primas via in-app click — back visible + breadcrumb shows both crumbs')
  // First return to / (we may already be there from step 4) so the
  // next navigation is an in-app transition that populates the browser
  // history stack — required for the AppBar back button to render.
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="app-bar"]', { timeout: TIMEOUT_MS })
  // Click the home card "Materias Primas" button on the home view to
  // navigate via vue-router (which populates history.state.back).
  await page.waitForSelector('[data-testid="home-btn-materias-primas"]', { timeout: TIMEOUT_MS })
  await page.click('[data-testid="home-btn-materias-primas"]')
  await page.waitForFunction(() => location.pathname === '/materias-primas', { timeout: TIMEOUT_MS })
  // Debug: read history.state after navigation
  const debugState = await page.evaluate(() => ({
    historyState: JSON.stringify(history.state),
    locationPath: location.pathname,
  }))
  console.log(`  [debug] ${JSON.stringify(debugState)}`)
  // Give the v-app-bar a tick to react.
  await new Promise((r) => setTimeout(r, 300))
  await page.waitForSelector('[data-testid="app-bar-back"]', { timeout: TIMEOUT_MS })

  const volverVisibleAnidado = await assertacion(page, 'app-bar-back', true)
  evidence.assertions.push(volverVisibleAnidado)
  if (volverVisibleAnidado.ok) logOk('back button visible on /materias-primas')
  else { logFail('back button MISSING on /materias-primas'); verdict = 'FAIL' }

  const breadcrumbAnidado = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="breadcrumb-nav"]')
    return nav ? nav.textContent : ''
  })
  const contieneAmbos = breadcrumbAnidado && breadcrumbAnidado.includes('Inicio') && breadcrumbAnidado.includes('Materias primas')
  if (contieneAmbos) {
    logOk(`breadcrumb on /materias-primas contains both crumbs: "${breadcrumbAnidado.trim()}"`)
    evidence.assertions.push({ testid: 'breadcrumb-nested', presente: true, ok: true, texto: breadcrumbAnidado.trim() })
  } else {
    logFail(`breadcrumb on /materias-primas MISSING crumbs: "${breadcrumbAnidado}"`)
    evidence.assertions.push({ testid: 'breadcrumb-nested', presente: false, ok: false, texto: breadcrumbAnidado })
    verdict = 'FAIL'
  }

  logHeader('6/7  Click back button — URL returns to /')
  await page.click('[data-testid="app-bar-back"]')
  await page.waitForFunction(() => location.pathname === '/', { timeout: TIMEOUT_MS })
  const urlFinal = await page.evaluate(() => location.pathname)
  evidence.finalUrl = urlFinal
  if (urlFinal === '/') {
    logOk(`back button navigated to ${urlFinal}`)
    evidence.assertions.push({ testid: 'back-navigation', presente: true, ok: true, texto: urlFinal })
  } else {
    logFail(`back button navigated to ${urlFinal} (expected /)`)
    evidence.assertions.push({ testid: 'back-navigation', presente: false, ok: false, texto: urlFinal })
    verdict = 'FAIL'
  }

  logHeader('7/7  Re-assert back hidden after returning to /')
  await page.waitForSelector('[data-testid="app-bar"]', { timeout: TIMEOUT_MS })
  // Give the route guard a tick to settle.
  await new Promise((r) => setTimeout(r, 200))
  const volverOcultoTrasBack = await assertacion(page, 'app-bar-back', false)
  evidence.assertions.push(volverOcultoTrasBack)
  if (volverOcultoTrasBack.ok) logOk('back button hidden after returning to /')
  else { logFail('back button VISIBLE after returning to /'); verdict = 'FAIL' }
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

console.log('\n=== UX-PR1 Browser Verification Report ===')
console.log(JSON.stringify({ verdict, evidence }, null, 2))
process.exit(verdict === 'PASS' ? 0 : 1)