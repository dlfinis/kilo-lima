#!/usr/bin/env node
import puppeteer from 'puppeteer'

const URL = 'http://127.0.0.1:5000'
const CHROME = '/Users/diegofernando.leon/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox'],
  })

  const page = await browser.newPage()
  
  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [JS ERROR]', msg.text().substring(0,120))
  })
  page.on('pageerror', err => console.log('  [PAGE ERROR]', err.message.substring(0,120)))

  // Go to eventos page directly
  await page.goto(`${URL}/eventos`, { waitUntil: 'networkidle2', timeout: 20000 })
  
  // Take screenshot for debugging
  await page.screenshot({ path: '/tmp/eventos-debug.png' })
  
  const html = await page.content()
  const bodyText = await page.$eval('body', el => el.textContent?.substring(0, 500))
  console.log('Body (first 500 chars):', bodyText)
  
  // Check for error alerts
  const alerts = await page.$$('.v-alert')
  for (const a of alerts) {
    const text = await a.evaluate(el => el.textContent)
    console.log('Alert:', text?.substring(0, 200))
  }

  await browser.close()
}

main().catch(e => console.error(e.message))
