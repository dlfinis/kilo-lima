#!/usr/bin/env node
// scripts/db-restore.mjs
// ---------------------------------------------------------------------
// Restore a plain SQL backup into the local Supabase/Postgres database
// using `psql`.
//
// Usage:
//   node scripts/db-restore.mjs backups/db-backup-2026-07-16T10-00-00.sql
//   node scripts/db-restore.mjs --file backups/manual.sql --yes
//
// Requirements:
//   * node >= 22
//   * .env.local with SUPABASE_PSQL_CONNECTION
//   * `psql` available in PATH
// ---------------------------------------------------------------------
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const ARGS = process.argv.slice(2)
const YES = ARGS.includes('--yes')
const FLAG_FILE = ARGS.indexOf('--file')
const FILE_OVERRIDE = FLAG_FILE >= 0 ? ARGS[FLAG_FILE + 1] : null
const POSITIONAL_FILE = ARGS.find((arg, index) => {
  if (arg.startsWith('--')) return false
  return index === 0 || ARGS[index - 1] !== '--file'
})

async function loadDotenv() {
  const envPath = path.join(REPO_ROOT, '.env.local')
  let raw = ''
  try {
    raw = await fs.readFile(envPath, 'utf8')
  } catch {
    throw new Error(`Could not find ${envPath}. Create it from .env.example first.`)
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')

    if (!process.env[key]) process.env[key] = value
  }
}

function getConfig() {
  const psql = process.env.SUPABASE_PSQL_CONNECTION
  if (!psql) {
    throw new Error(
      'Missing SUPABASE_PSQL_CONNECTION in .env.local. Expected a postgres:// or postgresql:// connection string.',
    )
  }

  return { psql }
}

function resolveInputPath() {
  if (FLAG_FILE >= 0 && !FILE_OVERRIDE) {
    throw new Error('The --file flag requires a file path.')
  }

  const target = FILE_OVERRIDE ?? POSITIONAL_FILE
  if (!target) {
    throw new Error('Provide a backup file path as the first argument or with --file.')
  }

  return path.resolve(target)
}

async function ensureBinary(name, installHint) {
  await new Promise((resolve, reject) => {
    const child = spawn(name, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Could not find \`${name}\` in PATH. ${installHint}`))
        return
      }
      reject(err)
    })

    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${name} --version failed with code ${code}. ${stderr}`.trim()))
    })
  })
}

async function runRestore(connectionString, backupPath) {
  await new Promise((resolve, reject) => {
    const args = ['-v', 'ON_ERROR_STOP=1', '-X', '-f', backupPath, connectionString]
    const child = spawn('psql', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          `psql exited with code ${code}\n\nSTDERR:\n${stderr}\n\nSTDOUT:\n${stdout}`.trim(),
        ),
      )
    })
  })
}

async function confirmRestore(backupPath) {
  if (YES) return true

  const rl = readline.createInterface({ input, output })
  const answer = await rl.question(
    `This will restore ${backupPath} into the configured database and may overwrite data. Continue? [y/N] `,
  )
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

async function main() {
  await loadDotenv()
  const config = getConfig()
  const backupPath = resolveInputPath()

  if (path.extname(backupPath).toLowerCase() !== '.sql') {
    throw new Error('Restore input must be a .sql file.')
  }

  await fs.access(backupPath)
  await ensureBinary(
    'psql',
    'Install the PostgreSQL client tools first (for example: brew install postgresql@16).',
  )

  if (!(await confirmRestore(backupPath))) {
    console.log('Restore cancelled.')
    return
  }

  console.log(`Restoring backup from ${backupPath}`)
  await runRestore(config.psql, backupPath)
  console.log('Restore completed successfully.')
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})
