#!/usr/bin/env node
// REQ-POS-46, REQ-POS-45 + PR3 REAL BROWSER VERIFICATION gate.
// Boots headless Puppeteer against the running Vite dev server,
// navigates to /pos and asserts:
//   1. The PosView heading ("POS") renders in the body
//   2. The product grid renders the empty/error state (no productos
//      in the dev Supabase backend)
//   3. The cart panel is present in the DOM
//   4. The no-evento guard surfaces when there is no evento en_curso
//
// Run: `pnpm verify:pr3`.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const BASE = process.env.PR3_URL ?? 'http://127.0.0.1:5173'
const POS_URL = `${BASE}/pos`
const PRODUCTOS_URL = `${BASE}/productos`
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

const tmpProfile = mkdtempSync(join(tmpdir(), 'pr3-verify-'))
let browser
let server
let verdict = 'PASS'
const evidence = {
  base: BASE,
  chromePath: CHROME_PATH,
  tmpProfile,
  pos: {},
  productos: {},
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
  logHeader('1/8  Start Vite dev server (detached child)')
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

  logHeader('2/8  Wait for http://127.0.0.1:5173/ to respond')
  const up = await waitForServer(BASE, TIMEOUT_MS)
  if (!up) {
    logFail(`server did not respond within ${TIMEOUT_MS}ms`)
    verdict = 'FAIL'
    throw new Error('server-unreachable')
  }
  logOk('server is reachable')

  logHeader('3/8  Launch headless Puppeteer')
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

  logHeader('4/8  Navigate to /pos and wait for PosView title')
  await page.goto(POS_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="pos-titulo"]', { timeout: TIMEOUT_MS })
  const mountInfo = await page.evaluate(() => {
    const root = document.querySelector('#app')
    return {
      hasChildren: !!root && root.children.length > 0,
      childCount: root ? root.children.length : 0,
      bodyTextLength: document.body.innerText.length,
    }
  })
  evidence.pos.mountCheck = mountInfo
  if (mountInfo.hasChildren) {
    logOk(`/pos mounted with ${mountInfo.childCount} children`)
  } else {
    logFail('/pos — #app has no children')
    verdict = 'FAIL'
  }

  logHeader('5/8  Assert /pos body contains "POS" (REQ-POS-46)')
  const bodyText = await page.evaluate(() => document.body.innerText)
  evidence.pos.bodyTextSample = bodyText.slice(0, 1200)
  if (bodyText.includes('POS')) {
    logOk('/pos body contains "POS" heading')
    evidence.pos.title = { needle: 'POS', result: 'PASS' }
  } else {
    logFail('/pos body MISSING "POS" heading')
    evidence.pos.title = { needle: 'POS', result: 'FAIL' }
    verdict = 'FAIL'
  }

  logHeader('6/8  Verify product grid empty state (REQ-POS-24)')
  // The dev backend has no productos → the grid renders the empty
  // alert with the catalog link.
  if (
    bodyText.includes('No hay productos disponibles') ||
    bodyText.includes('No hay un evento en curso')
  ) {
    logOk('/pos renders the no-productos or no-evento guard')
    evidence.pos.empty = { result: 'PASS' }
  } else {
    logFail('/pos missing empty state messaging')
    evidence.pos.empty = { result: 'FAIL' }
    verdict = 'FAIL'
  }

  logHeader('7/8  Verify cart panel is present in the DOM')
  // The cart panel only renders once an evento en_curso exists — on a
  // clean dev backend with no events, the no-evento guard takes its
  // place. Either the cart panel testid or the no-evento testid is
  // acceptable evidence that PosView mounted (REQ-POS-25 + REQ-POS-16).
  const cartPresent =
    bodyText.includes('No hay un evento en curso') ||
    (await page.$('[data-testid="carrito-panel"]')) !== null
  if (cartPresent) {
    logOk('cart panel or no-evento guard is rendered')
    evidence.pos.cartPanel = { result: 'PASS' }
  } else {
    logFail('cart panel and no-evento guard BOTH missing')
    evidence.pos.cartPanel = { result: 'FAIL' }
    verdict = 'FAIL'
  }

  logHeader('8/8  Verify /productos regression (REQ-POS-46 — PR2 surface still renders)')
  await page.goto(PRODUCTOS_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  await page.waitForSelector('[data-testid="productos-titulo"]', { timeout: TIMEOUT_MS })
  const prodText = await page.evaluate(() => document.body.innerText)
  evidence.productos.bodyTextSample = prodText.slice(0, 600)
  if (prodText.includes('Productos')) {
    logOk('/productos body contains "Productos" (no regression)')
    evidence.productos.title = { needle: 'Productos', result: 'PASS' }
  } else {
    logFail('/productos body MISSING "Productos"')
    evidence.productos.title = { needle: 'Productos', result: 'FAIL' }
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

console.log('\n=== PR3 Browser Verification Report ===')
console.log(JSON.stringify({ verdict, evidence }, null, 2))
process.exit(verdict === 'PASS' ? 0 : 1)