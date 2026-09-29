// sync.js — find replies from tracked leads, star them, and tell someone.
//
// Incremental on purpose. The first version of this scanned the trailing 180
// days on every run, which takes tens of seconds and times out a serverless
// function. Now a cursor remembers the last day scanned, and each run reads
// only from that day on. The last day is always re-read (OVERLAP_DAYS),
// because a message can be indexed a moment after it arrives, and processed
// ids make the re-read free.
//
// Writes are capped per run (STAR_MAX_PER_RUN) so the first sync after
// install, with months of replies to catch up on, catches up over a few runs
// instead of spending the whole time budget on the first.

import { header, addressOf, bodyText, newText, kindOf } from './parse.js'

export const OVERLAP_DAYS = 1
export const DEFAULT_BACKFILL_DAYS = 30
export const STAR_MAX_PER_RUN = 60
const CONCURRENCY = 5
const KEEP_IDS = 5000

const day = (d) => d.toISOString().slice(0, 10)
const gmailDate = (iso) => iso.replace(/-/g, '/')
const minusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return day(d)
}

async function inBatches(items, size, fn) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
}

/**
 * @param {object} p
 * @param {object} p.client     { listIds, getMessage, star }
 * @param {string[]} p.leads    lead email addresses to watch for
 * @param {object} p.state      { cursor?, processed?: string[], starred?: string[] } (mutated)
 * @param {Date} [p.now]
 * @param {(event: object) => Promise<void>} [p.notify]
 * @returns {Promise<{ query: string, scanned: number, events: object[] }>}
 */
export async function runSync({ client, leads, state, now = new Date(), notify = async () => {} }) {
  const watched = new Set(leads.map((e) => e.toLowerCase()))
  const since = state.cursor ? minusDays(state.cursor, OVERLAP_DAYS) : minusDays(day(now), DEFAULT_BACKFILL_DAYS)
  // Automated senders and your own sent mail never count as a reply.
  const query = `in:inbox after:${gmailDate(since)} -from:me -category:promotions -category:social`

  const processed = new Set(state.processed || [])
  const starred = new Set(state.starred || [])
  const ids = (await client.listIds(query)).filter((id) => !processed.has(id))
  const messages = await inBatches(ids, CONCURRENCY, (id) => client.getMessage(id))

  const events = []
  for (const msg of messages) {
    processed.add(msg.id)
    const kind = kindOf(msg)
    const body = bodyText(msg)
    // A bounce names the lead in its body; a reply comes from the lead.
    const lead = kind === 'bounce'
      ? [...watched].find((e) => body.toLowerCase().includes(e))
      : watched.has(addressOf(header(msg, 'From'))) && addressOf(header(msg, 'From'))
    if (!lead) continue
    events.push({
      id: msg.id,
      threadId: msg.threadId,
      kind,
      lead,
      from: header(msg, 'From'),
      subject: header(msg, 'Subject'),
      date: new Date(Number(msg.internalDate)).toISOString(),
      body: newText(body).slice(0, 2000),
    })
  }

  // One write per thread, even when a thread got two replies since the last run.
  const byThread = new Map()
  for (const e of events) if (e.kind === 'reply' && !starred.has(e.threadId) && !byThread.has(e.threadId)) byThread.set(e.threadId, e)
  const toStar = [...byThread.values()].slice(0, STAR_MAX_PER_RUN)
  await inBatches(toStar, CONCURRENCY, async (e) => {
    await client.star(e.threadId)
    starred.add(e.threadId)
    e.starred = true
  })

  for (const e of events.filter((x) => x.kind === 'reply')) await notify(e)

  state.cursor = day(now)
  state.processed = [...processed].slice(-KEEP_IDS)
  state.starred = [...starred].slice(-KEEP_IDS)
  return { query, scanned: ids.length, events }
}
