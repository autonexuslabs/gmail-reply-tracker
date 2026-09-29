// Two scheduled runs, a day apart, against a fake mailbox in the Gmail API's
// own message format. No Google account needed.
//
//   npm run demo

import { readFileSync } from 'node:fs'
import { runSync } from '../src/sync.js'
import { mockClient } from '../src/mockClient.js'
import { telegramNotify } from '../src/notify.js'

const mailbox = JSON.parse(readFileSync(new URL('./mailbox.json', import.meta.url), 'utf8'))
const leads = readFileSync(new URL('./leads.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean)
const env = {} // no Telegram token: alerts print as dry runs
const state = {}

async function run(label, now) {
  // The mailbox as it looked at that moment.
  const client = mockClient(mailbox.filter((m) => Number(m.internalDate) <= now.getTime()))
  console.log(`\n── ${label} ──────────────────────────────────`)
  const r = await runSync({ client, leads, state, now, notify: (e) => telegramNotify(e, env) })
  console.log(`\nquery:   ${r.query}`)
  console.log(`scanned: ${r.scanned} new messages, ${r.events.length} from tracked leads`)
  for (const e of r.events) console.log(`  ${e.kind.padEnd(10)} ${e.lead}${e.starred ? '  ★ starred' : e.kind === 'reply' ? '  (thread already starred)' : ''}`)
}

await run('Run 1 · Tue 18:00 UTC (first run, 30-day backfill)', new Date('2026-10-06T18:00:00Z'))
await run('Run 2 · Wed 18:00 UTC (incremental)', new Date('2026-10-07T18:00:00Z'))
console.log(`\nstate: cursor ${state.cursor}, ${state.processed.length} processed ids, ${state.starred.length} starred threads\n`)
