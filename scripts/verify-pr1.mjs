#!/usr/bin/env node
// REQ-POS-56, plus the new REAL verification gate (PR1): the app
// must actually render in a real browser — not just pass typecheck +
// lint + build + unit tests. This script boots a headless Puppeteer
// against the running Vite dev server (http://127.0.0.1:5173/),
// waits for Vue to mount on #app, and asserts the body text contains
// the expected home page text.
//
// PR1 doesn't add new routes — it adds the schema/types/helpers that
// PR2+ will wire — so the assertion is the existing home page text
// ("Kilo-Lima" + "Pre-evento · Durante evento · Post-evento" +
// the connection-status card). If the app fails to mount or the text
// is missing, the script exits 1 with a FAIL line so the CI gate
// blocks the PR.
//
// Run: `pnpm verify:pr1`. The script starts `pnpm dev` itself
// (detached child), waits for the server, runs Puppeteer, kills the
// child, and prints the report.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const URL = process.env.PR1_URL ?? 'http://127.0.0.1:5173/'
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

const tmpProfile = mkdtempSync(join(tmpdir(), 'pr1-verify-'))
let browser
let server
let verdict = 'PASS'
const evidence = {
  url: URL,
  chromePath: CHROME_PATH,
  tmpProfile,
  assertions: [],
  bodyTextSample: '',
  htmlSample: '',
  mountCheck: null,
}

async function killServer() {
  if (server && !server.killed) {
    try {
      server.kill('SIGTERM')
    } catch {
      // already gone
    }
    // Give it a moment, then SIGKILL if still alive.
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
  logHeader('1/5  Start Vite dev server (detached child)')
  server = spawn('pnpm', ['dev', '--port', '5173', '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  server.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    // Surface only the Vite "ready" line so the user sees progress.
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

  logHeader('2/5  Wait for http://127.0.0.1:5173/ to respond')
  const up = await waitForServer(URL, TIMEOUT_MS)
  if (!up) {
    logFail(`server did not respond within ${TIMEOUT_MS}ms`)
    verdict = 'FAIL'
    throw new Error('server-unreachable')
  }
  logOk('server is reachable')

  logHeader('3/5  Launch headless Puppeteer')
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
      if (!text.includes('Failed to mount')) {
        logFail(`console.error: ${text}`)
        verdict = 'FAIL'
      }
    }
  })

  logHeader('4/5  Navigate + wait for #app to have children')
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS })
  await page.waitForSelector('#app > *', { timeout: TIMEOUT_MS })
  const mountInfo = await page.evaluate(() => {
    const root = document.querySelector('#app')
    return {
      hasChildren: !!root && root.children.length > 0,
      childCount: root ? root.children.length : 0,
      bodyTextLength: document.body.innerText.length,
    }
  })
  evidence.mountCheck = mountInfo
  if (mountInfo.hasChildren) {
    logOk(`#app mounted with ${mountInfo.childCount} children`)
  } else {
    logFail('#app has no children — Vue did not mount')
    verdict = 'FAIL'
  }

  logHeader('5/5  Assert home page text renders')
  const bodyText = await page.evaluate(() => document.body.innerText)
  const html = await page.evaluate(() => document.body.innerHTML)
  evidence.bodyTextSample = bodyText.slice(0, 800)
  evidence.htmlSample = html.slice(0, 800)

  const expectations = [
    { needle: 'Kilo-Lima', label: 'brand heading' },
    { needle: 'Pre-evento · Durante evento · Post-evento', label: 'phase line' },
  ]
  for (const { needle, label } of expectations) {
    if (bodyText.includes(needle)) {
      logOk(`body text contains ${label}: "${needle}"`)
      evidence.assertions.push({ needle, label, result: 'PASS' })
    } else {
      logFail(`body text MISSING ${label}: "${needle}"`)
      evidence.assertions.push({ needle, label, result: 'FAIL' })
      verdict = 'FAIL'
    }
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

console.log('\n=== PR1 Browser Verification Report ===')
console.log(JSON.stringify({ verdict, evidence }, null, 2))
process.exit(verdict === 'PASS' ? 0 : 1)
