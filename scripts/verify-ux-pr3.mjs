#!/usr/bin/env node
// REQ-UX-20..24 + REQ-UX-27: real-browser verification for PR3
// (per-view FABs). Spawns `pnpm dev --port 5000 --strictPort`, waits
// for the server, launches headless Puppeteer, then drives each of
// the 3 list views to assert:
//
//   1. /materias-primas — FAB is rendered with testid
//      `materia-prima-fab-nuevo` and the spec-locked aria-label
//      "Nueva materia prima"; clicking it opens the create dialog
//      (REQ-UX-20, REQ-UX-21).
//   2. /recetas — FAB is rendered with testid `receta-fab-nuevo`
//      and aria-label "Nueva receta"; clicking it opens the create
//      dialog (REQ-UX-22).
//   3. /eventos — FAB is rendered with testid `evento-fab-nuevo`
//      and aria-label "Nuevo evento" while the list is short
//      (REQ-UX-23). The seed has at most 1 evento (no `en_curso`),
//      so the FAB is always visible per the visibility rule
//      `eventos.length < 5` (REQ-UX-24).
//
// Every assertion exits non-zero on FAIL so CI catches regressions.
// Run: `pnpm verify:ux-pr3`.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const URL = process.env.UX_PR3_URL ?? 'http://127.0.0.1:5000/'
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

const tmpProfile = mkdtempSync(join(tmpdir(), 'ux-pr3-verify-'))
let browser
let server
let verdict = 'PASS'
const evidence = {
  url: URL,
  chromePath: CHROME_PATH,
  tmpProfile,
  assertions: [],
  fabs: {},
  dialogs: {},
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

async function assertFabPresent(page, testid, ariaLabel) {
  const handle = await page.evaluate(
    (sel) => {
      const el = document.querySelector(`[data-testid="${sel}"]`)
      if (!el) return null
      return {
        testid: el.getAttribute('data-testid'),
        ariaLabel: el.getAttribute('aria-label'),
        tag: el.tagName.toLowerCase(),
        // Sanity: FAB is rendered with the v-fab class.
        classes: el.className,
      }
    },
    testid,
  )
  const existe = handle !== null
  const ariaOk = existe && handle.ariaLabel === ariaLabel
  const testidOk = existe && handle.testid === testid
  const ok = existe && ariaOk && testidOk
  return { testid, ariaLabel, handle, existe, ariaOk, testidOk, ok }
}

try {
  logHeader('1/6  Start Vite dev server on port 5000')
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

  logHeader('2/6  Wait for server')
  const up = await waitForServer(URL, TIMEOUT_MS)
  if (!up) {
    logFail(`server did not respond within ${TIMEOUT_MS}ms`)
    verdict = 'FAIL'
    throw new Error('server-unreachable')
  }
  logOk('server is reachable')

  logHeader('3/6  Launch headless Puppeteer')
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

  logHeader('4/6  /materias-primas — FAB present, opens create dialog (REQ-UX-20, REQ-UX-21)')
  await page.goto(URL + 'materias-primas', { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="materia-prima-fab-nuevo"]', { timeout: TIMEOUT_MS })
  const fabMp = await assertFabPresent(page, 'materia-prima-fab-nuevo', 'Nueva materia prima')
  evidence.fabs.materiasPrimas = fabMp
  if (fabMp.ok) {
    logOk(`materia-prima-fab-nuevo rendered (aria-label="${fabMp.ariaLabel}", classes match v-fab: ${/v-fab/.test(fabMp.handle?.classes ?? '')})`)
    evidence.assertions.push({ testid: 'fab-materias-primas', ok: true, ariaLabel: fabMp.ariaLabel })
  } else {
    logFail(`materia-prima-fab-nuevo MISSING or wrong aria-label: ${JSON.stringify(fabMp)}`)
    evidence.assertions.push({ testid: 'fab-materias-primas', ok: false, fab: fabMp })
    verdict = 'FAIL'
  }
  // Click the FAB and assert the create dialog opens. v-fab renders
  // as a <div> wrapping an inner <button> — page.click() on the
  // testid's div may miss the click target on a fast SPA, so we
  // click the inner <button> explicitly.
  const clickedMp = await page.evaluate(() => {
    const fab = document.querySelector('[data-testid="materia-prima-fab-nuevo"]')
    if (!fab) return false
    const btn = fab.querySelector('button') ?? fab
    btn.click()
    return true
  })
  if (!clickedMp) {
    logFail('materia-prima-fab-nuevo not found in DOM when clicking')
    verdict = 'FAIL'
  }
  await new Promise((r) => setTimeout(r, 500))
  const dialogoMp = await page.evaluate(() => {
    const texto = document.body.textContent ?? ''
    return {
      contieneNuevaMateriaPrima: texto.includes('Nueva materia prima'),
      formRendered: document.querySelector('form.materia-prima-form') !== null,
    }
  })
  evidence.dialogs.materiasPrimas = dialogoMp
  if (dialogoMp.contieneNuevaMateriaPrima && dialogoMp.formRendered) {
    logOk('clicking the FAB opened the create-materia-prima dialog (form rendered)')
  } else {
    logFail(`FAB click did not open the create dialog: ${JSON.stringify(dialogoMp)}`)
    verdict = 'FAIL'
  }
  // Close the dialog by pressing Escape.
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 300))

  logHeader('5/6  /recetas — FAB present, opens create dialog (REQ-UX-20, REQ-UX-22)')
  await page.goto(URL + 'recetas', { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="receta-fab-nuevo"]', { timeout: TIMEOUT_MS })
  const fabRec = await assertFabPresent(page, 'receta-fab-nuevo', 'Nueva receta')
  evidence.fabs.recetas = fabRec
  if (fabRec.ok) {
    logOk(`receta-fab-nuevo rendered (aria-label="${fabRec.ariaLabel}", classes match v-fab: ${/v-fab/.test(fabRec.handle?.classes ?? '')})`)
    evidence.assertions.push({ testid: 'fab-recetas', ok: true, ariaLabel: fabRec.ariaLabel })
  } else {
    logFail(`receta-fab-nuevo MISSING or wrong aria-label: ${JSON.stringify(fabRec)}`)
    evidence.assertions.push({ testid: 'fab-recetas', ok: false, fab: fabRec })
    verdict = 'FAIL'
  }
  await page.evaluate(() => {
    const fab = document.querySelector('[data-testid="receta-fab-nuevo"]')
    if (!fab) return
    const btn = fab.querySelector('button') ?? fab
    btn.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  const dialogoRec = await page.evaluate(() => {
    const texto = document.body.textContent ?? ''
    return {
      contieneNuevaReceta: texto.includes('Nueva receta'),
      formRendered: document.querySelector('form.receta-form') !== null,
    }
  })
  evidence.dialogs.recetas = dialogoRec
  if (dialogoRec.contieneNuevaReceta && dialogoRec.formRendered) {
    logOk('clicking the FAB opened the create-receta dialog (form rendered)')
  } else {
    logFail(`FAB click did not open the create dialog: ${JSON.stringify(dialogoRec)}`)
    verdict = 'FAIL'
  }
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 300))

  logHeader('6/6  /eventos — FAB present + visibility rule (REQ-UX-23, REQ-UX-24)')
  await page.goto(URL + 'eventos', { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  // The seed has at most 1 evento (no `en_curso`), so eventos.length < 5
  // and the FAB is visible. Wait for the FAB.
  await page.waitForSelector('[data-testid="evento-fab-nuevo"]', { timeout: TIMEOUT_MS })
  const fabEv = await assertFabPresent(page, 'evento-fab-nuevo', 'Nuevo evento')
  evidence.fabs.eventos = fabEv
  if (fabEv.ok) {
    logOk(`evento-fab-nuevo rendered (aria-label="${fabEv.ariaLabel}", classes match v-fab: ${/v-fab/.test(fabEv.handle?.classes ?? '')})`)
    evidence.assertions.push({ testid: 'fab-eventos', ok: true, ariaLabel: fabEv.ariaLabel })
  } else {
    logFail(`evento-fab-nuevo MISSING or wrong aria-label: ${JSON.stringify(fabEv)}`)
    evidence.assertions.push({ testid: 'fab-eventos', ok: false, fab: fabEv })
    verdict = 'FAIL'
  }
  // Visibility rule: with < 5 eventos, the inline button MUST be hidden.
  const inlineHidden = await page.evaluate(
    () => document.querySelector('[data-testid="evento-nuevo"]') === null,
  )
  if (inlineHidden) {
    logOk('inline "+ Nuevo evento" button HIDDEN (eventos.length < 5 → FAB only)')
  } else {
    logFail('inline "+ Nuevo evento" button VISIBLE (should be hidden when FAB is shown)')
    verdict = 'FAIL'
  }
  // Sanity: clicking the FAB opens the create dialog.
  await page.evaluate(() => {
    const fab = document.querySelector('[data-testid="evento-fab-nuevo"]')
    if (!fab) return
    const btn = fab.querySelector('button') ?? fab
    btn.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  const dialogoEv = await page.evaluate(() => {
    const texto = document.body.textContent ?? ''
    return {
      contieneNuevoEvento: texto.includes('Nuevo evento'),
      // EventoForm does not have a .evento-form class; assert any form rendered.
      formRendered: document.querySelector('form') !== null,
    }
  })
  evidence.dialogs.eventos = dialogoEv
  if (dialogoEv.contieneNuevoEvento && dialogoEv.formRendered) {
    logOk('clicking the FAB opened the create-evento dialog (form rendered)')
  } else {
    logFail(`FAB click did not open the create dialog: ${JSON.stringify(dialogoEv)}`)
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

console.log('\n=== UX-PR3 Browser Verification Report ===')
console.log(JSON.stringify({ verdict, evidence }, null, 2))
process.exit(verdict === 'PASS' ? 0 : 1)
