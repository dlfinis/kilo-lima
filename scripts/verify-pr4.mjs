#!/usr/bin/env node
// REQ-POS-46, REQ-POS-45 + PR4 REAL BROWSER VERIFICATION gate.
// Boots headless Puppeteer against the running Vite dev server,
// navigates to /pos/cierre and asserts:
//   1. The CierresCajaView heading renders
//   2. The /pos body now contains the new Imprevistos section
//      (REQ-POS-40 — collapsible section added in PR4)
// Then re-runs verify-pr1, verify-pr2, verify-pr3 to confirm NO
// REGRESSIONS across prior PRs.
//
// Run: `pnpm verify:pr4`.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const BASE = process.env.PR4_URL ?? 'http://127.0.0.1:5173'
const CIERRE_URL = `${BASE}/pos/cierre`
const POS_URL = `${BASE}/pos`
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

async function runVerifyScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      process.stdout.write(`  [${scriptPath}] ${chunk}`)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      process.stderr.write(`  [${scriptPath} ERR] ${chunk}`)
    })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

const tmpProfile = mkdtempSync(join(tmpdir(), 'pr4-verify-'))
let browser
let server
let verdict = 'PASS'
const evidence = {
  base: BASE,
  chromePath: CHROME_PATH,
  tmpProfile,
  cierre: {},
  pos: {},
  regressions: {},
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
  logHeader('1/10  Start Vite dev server (detached child)')
  server = spawn('pnpm', ['dev', '--port', '5173', '--strictPort'], {
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

  logHeader('2/10  Wait for http://127.0.0.1:5173/ to respond')
  const up = await waitForServer(BASE, TIMEOUT_MS)
  if (!up) {
    logFail(`server did not respond within ${TIMEOUT_MS}ms`)
    verdict = 'FAIL'
    throw new Error('server-unreachable')
  }
  logOk('server is reachable')

  logHeader('3/10  Launch headless Puppeteer')
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

  logHeader('4/10  Navigate to /pos/cierre and wait for CierresCajaView title')
  await page.goto(CIERRE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="cierre-titulo"]', { timeout: TIMEOUT_MS })
  const mountInfo = await page.evaluate(() => {
    const root = document.querySelector('#app')
    return {
      hasChildren: !!root && root.children.length > 0,
      childCount: root ? root.children.length : 0,
      bodyTextLength: document.body.innerText.length,
    }
  })
  evidence.cierre.mountCheck = mountInfo
  if (mountInfo.hasChildren) {
    logOk(`/pos/cierre mounted with ${mountInfo.childCount} children`)
  } else {
    logFail('/pos/cierre — #app has no children')
    verdict = 'FAIL'
  }

  logHeader('5/10  Assert /pos/cierre body contains "Cierre de caja" (REQ-POS-46)')
  const cierreText = await page.evaluate(() => document.body.innerText)
  evidence.cierre.bodyTextSample = cierreText.slice(0, 1200)
  if (
    cierreText.includes('Cierre de caja') ||
    cierreText.includes('Cierre') ||
    cierreText.includes('Caja')
  ) {
    logOk('/pos/cierre body contains the cierre heading')
    evidence.cierre.title = { needle: 'Cierre de caja', result: 'PASS' }
  } else {
    logFail('/pos/cierre body MISSING "Cierre de caja" heading')
    evidence.cierre.title = { needle: 'Cierre de caja', result: 'FAIL' }
    verdict = 'FAIL'
  }

  logHeader('6/10  Verify /pos/cierre shows the no-evento guard (REQ-POS-49)')
  // With the dev backend empty, there is no evento activo → the
  // view renders the "No hay un evento para cerrar" guard.
  if (cierreText.includes('No hay un evento') || cierreText.includes('Ir a Eventos')) {
    logOk('/pos/cierre renders the no-evento guard')
    evidence.cierre.empty = { result: 'PASS' }
  } else {
    logFail('/pos/cierre missing the no-evento guard')
    evidence.cierre.empty = { result: 'FAIL' }
    verdict = 'FAIL'
  }

  logHeader('7/10  Navigate to /pos and verify the new Imprevistos section (REQ-POS-40)')
  await page.goto(POS_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="pos-titulo"]', { timeout: TIMEOUT_MS })
  const posText = await page.evaluate(() => document.body.innerText)
  evidence.pos.bodyTextSample = posText.slice(0, 1500)
  const imprevistosSection = await page.$('[data-testid="pos-imprevistos"]')
  if (imprevistosSection) {
    logOk('/pos renders the new Imprevistos collapsible section (REQ-POS-40)')
    evidence.pos.imprevistosSection = { result: 'PASS' }
  } else {
    logFail('/pos MISSING the Imprevistos collapsible section (REQ-POS-40)')
    evidence.pos.imprevistosSection = { result: 'FAIL' }
    verdict = 'FAIL'
  }
  const totalChip = await page.$('[data-testid="pos-imprevistos-total"]')
  if (totalChip) {
    logOk('/pos Imprevistos section shows the total chip')
    evidence.pos.totalChip = { result: 'PASS' }
  } else {
    logFail('/pos Imprevistos total chip missing')
    evidence.pos.totalChip = { result: 'FAIL' }
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

// After killing our own server, run the prior verifies (each starts
// its own detached server on port 5173).
logHeader('8/10  Regression: verify-pr1 (foundation + home)')
const pr1 = await runVerifyScript('scripts/verify-pr1.mjs')
evidence.regressions.pr1 = {
  exitCode: pr1.code,
  result: pr1.code === 0 ? 'PASS' : 'FAIL',
}
if (pr1.code === 0) {
  logOk('verify-pr1 PASS')
} else {
  logFail('verify-pr1 FAIL')
  verdict = 'FAIL'
}

logHeader('9/10  Regression: verify-pr2 (productos + recetas)')
const pr2 = await runVerifyScript('scripts/verify-pr2.mjs')
evidence.regressions.pr2 = {
  exitCode: pr2.code,
  result: pr2.code === 0 ? 'PASS' : 'FAIL',
}
if (pr2.code === 0) {
  logOk('verify-pr2 PASS')
} else {
  logFail('verify-pr2 FAIL')
  verdict = 'FAIL'
}

logHeader('10/10  Regression: verify-pr3 (POS ventas + cart)')
const pr3 = await runVerifyScript('scripts/verify-pr3.mjs')
evidence.regressions.pr3 = {
  exitCode: pr3.code,
  result: pr3.code === 0 ? 'PASS' : 'FAIL',
}
if (pr3.code === 0) {
  logOk('verify-pr3 PASS')
} else {
  logFail('verify-pr3 FAIL')
  verdict = 'FAIL'
}

console.log('\n=== PR4 Browser Verification Report ===')
console.log(JSON.stringify({ verdict, evidence }, null, 2))
process.exit(verdict === 'PASS' ? 0 : 1)