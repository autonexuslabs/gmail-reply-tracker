#!/usr/bin/env node
// One incremental sync. Schedule it every few minutes (cron, Cloud Scheduler,
// GitHub Actions); each run reads only what arrived since the last one.
//
//   node --env-file=.env bin/sync.js --leads leads.txt
//   node --env-file=.env bin/sync.js --leads leads.txt --out replies.jsonl
//
// leads.txt: one email address per line (or a CSV whose rows contain one).
// --out appends every event as a JSON line, the input format of
// email-sequence-sender's inbox stage.

import { readFileSync, appendFileSync } from 'node:fs'
import { gmailClient } from '../src/gmail.js'
import { runSync } from '../src/sync.js'
import { telegramNotify } from '../src/notify.js'
import { loadState, saveState } from '../src/state.js'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const leads = [...new Set(readFileSync(opt('leads', 'leads.txt'), 'utf8').match(/[\w.+-]+@[\w.-]+\.\w+/g) || [])]
const stateFile = opt('state', '.sync-state.json')
const state = loadState(stateFile)

const client = gmailClient({
  clientId: process.env.GMAIL_CLIENT_ID,
  clientSecret: process.env.GMAIL_CLIENT_SECRET,
  refreshToken: process.env.GMAIL_REFRESH_TOKEN,
})

const { query, scanned, events } = await runSync({ client, leads, state, notify: (e) => telegramNotify(e) })
saveState(stateFile, state)

console.log(`query:   ${query}`)
console.log(`scanned: ${scanned} new messages, ${events.length} from ${leads.length} tracked leads`)
for (const e of events) console.log(`  ${e.kind.padEnd(10)} ${e.lead}${e.starred ? '  ★' : ''}`)
if (opt('out')) for (const e of events) appendFileSync(opt('out'), JSON.stringify(e) + '\n')
