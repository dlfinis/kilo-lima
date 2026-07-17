#!/usr/bin/env node
// scripts/db-backup.mjs
// ---------------------------------------------------------------------
// Create a plain SQL backup of the local Supabase/Postgres database using
// `pg_dump`, defaulting to the public schema for restore-safe exports.
//
// Usage:
//   node scripts/db-backup.mjs
//   node scripts/db-backup.mjs --output backups/manual.sql
//
// Requirements:
//   * node >= 22
//   * .env.local with SUPABASE_PSQL_CONNECTION
//   * `pg_dump` available in PATH
// ---------------------------------------------------------------------
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const ARGS = process.argv.slice(2)
const FLAG_OUTPUT = ARGS.indexOf('--output')
const OUTPUT_OVERRIDE = FLAG_OUTPUT >= 0 ? ARGS[FLAG_OUTPUT + 1] : null

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

function getTimestamp() {
  return new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')
}

function resolveOutputPath() {
  if (OUTPUT_OVERRIDE) {
    return path.resolve(OUTPUT_OVERRIDE)
  }

  return path.join(REPO_ROOT, 'backups', `db-backup-${getTimestamp()}.sql`)
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

async function runBackup(connectionString, outputPath) {
  await new Promise((resolve, reject) => {
    const args = [
      '--format=plain',
      '--no-owner',
      '--no-privileges',
      '--schema=public',
      '--file',
      outputPath,
      connectionString,
    ]

    const child = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
          `pg_dump exited with code ${code}\n\nSTDERR:\n${stderr}\n\nSTDOUT:\n${stdout}`.trim(),
        ),
      )
    })
  })
}

async function main() {
  await loadDotenv()
  const config = getConfig()
  const outputPath = resolveOutputPath()

  if (FLAG_OUTPUT >= 0 && !OUTPUT_OVERRIDE) {
    throw new Error('The --output flag requires a file path.')
  }

  if (path.extname(outputPath).toLowerCase() !== '.sql') {
    throw new Error('Backup output must be a .sql file.')
  }

  await ensureBinary(
    'pg_dump',
    'Install the PostgreSQL client tools first (for example: brew install postgresql@16).',
  )

  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  console.log(`Creating backup at ${outputPath}`)
  await runBackup(config.psql, outputPath)
  console.log('Backup completed successfully.')
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})
