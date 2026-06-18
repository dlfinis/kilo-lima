// Verificación real headless: arranca headless, va a cada ruta, valida que
// Vue se monta y renderiza el contenido esperado. Captura errores de consola.

import puppeteer from 'puppeteer'
import { existsSync } from 'node:fs'

const CHROME_PATH = '/Users/diegofernando.leon/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

if (!existsSync(CHROME_PATH)) {
  console.error(`Chrome not found at ${CHROME_PATH}`)
  process.exit(1)
}

const routes = [
  { path: '/', expect: ['Kilo-Lima', 'Pre-evento'] },
  { path: '/materias-primas', expect: ['Materias Primas'] },
  { path: '/recetas', expect: ['Recetas'] },
  { path: '/eventos', expect: ['Eventos'] },
  { path: '/pos', expect: ['POS', 'Caja'] },
]

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROME_PATH,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})

let exitCode = 0

for (const { path, expect } of routes) {
  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  try {
    await page.goto(`http://127.0.0.1:5173${path}`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 1200))
    const bodyText = await page.evaluate(() => document.body.innerText)

    const found = expect.map((s) => ({ text: s, found: bodyText.includes(s) }))
    const allFound = found.every((f) => f.found)
    const hasContent = bodyText.length > 100

    console.log(`\n=== ${path} ===`)
    console.log(`  body length: ${bodyText.length} chars`)
    console.log(`  has content: ${hasContent}`)
    console.log(`  expectations: ${JSON.stringify(found)}`)
    console.log(`  console errors: ${consoleErrors.length}`)
    if (consoleErrors.length) consoleErrors.slice(0, 3).forEach((e) => console.log(`    [console] ${e.slice(0, 250)}`))
    console.log(`  page errors: ${pageErrors.length}`)
    if (pageErrors.length) pageErrors.slice(0, 3).forEach((e) => console.log(`    [pageerror] ${e.slice(0, 250)}`))
    if (allFound && pageErrors.length === 0 && hasContent) {
      console.log(`  STATUS: ✅ PASS`)
    } else {
      console.log(`  STATUS: ❌ FAIL`)
      exitCode = 1
    }
  } catch (err) {
    console.log(`\n=== ${path} ===`)
    console.log(`  STATUS: ❌ ERROR`)
    console.log(`  ${err.message.slice(0, 300)}`)
    exitCode = 1
  } finally {
    await page.close()
  }
}

await browser.close()
process.exit(exitCode)
