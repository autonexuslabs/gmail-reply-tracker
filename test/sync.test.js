import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runSync, STAR_MAX_PER_RUN } from '../src/sync.js'
import { mockClient } from '../src/mockClient.js'
import { bodyText, newText, kindOf, addressOf } from '../src/parse.js'
import { gmailClient } from '../src/gmail.js'
import { replyMessage } from '../src/notify.js'

const mailbox = JSON.parse(readFileSync(new URL('../examples/mailbox.json', import.meta.url), 'utf8'))
const leads = ['maria@northwind-heating.example', 'dev@cedarvalleyhvac.example', 'office@oakline.example', 'jo@ironwoodair.example']

test('parse: nested text/plain, quoted history stripped, address', () => {
  const m1 = mailbox.find((m) => m.id === 'm1')
  assert.match(bodyText(m1), /^Yes, send the demo over/)
  assert.equal(newText(bodyText(m1)), 'Yes, send the demo over. We lose a lot of calls on Saturdays.')
  assert.equal(newText('Who?\n\n-----Original Message-----\nFrom: x'), 'Who?')
  assert.equal(addressOf('Maria Lopez <Maria@X.example>'), 'maria@x.example')
})

test('kind: reply, auto-reply by header, bounce', () => {
  assert.equal(kindOf(mailbox.find((m) => m.id === 'm1')), 'reply')
  assert.equal(kindOf(mailbox.find((m) => m.id === 'm3')), 'auto_reply')
  assert.equal(kindOf(mailbox.find((m) => m.id === 'm4')), 'bounce')
})

test('only tracked leads produce events; bounces are matched by body', async () => {
  const state = {}
  const { events } = await runSync({ client: mockClient(mailbox), leads, state, now: new Date('2026-10-08T00:00:00Z') })
  assert.deepEqual(events.map((e) => e.lead).sort(), [
    'dev@cedarvalleyhvac.example', 'jo@ironwoodair.example', 'maria@northwind-heating.example',
    'maria@northwind-heating.example', 'office@oakline.example',
  ])
})

test('second run reads from the cursor minus overlap and skips processed ids', async () => {
  const state = {}
  const client = mockClient(mailbox)
  await runSync({ client, leads, state, now: new Date('2026-10-07T18:00:00Z') })
  const r = await runSync({ client, leads, state, now: new Date('2026-10-07T19:00:00Z') })
  assert.match(r.query, /after:2026\/10\/06/)
  assert.equal(r.scanned, 0)
  assert.equal(r.events.length, 0)
})

test('a thread is starred once, replies only, never auto-replies or bounces', async () => {
  const client = mockClient(mailbox)
  const state = {}
  await runSync({ client, leads, state, now: new Date('2026-10-08T00:00:00Z') })
  assert.deepEqual([...client.starred].sort(), ['t1', 't5'])
})

test('stars are capped per run', async () => {
  const many = Array.from({ length: STAR_MAX_PER_RUN + 10 }, (_, i) => ({
    id: `x${i}`, threadId: `tx${i}`, internalDate: String(Date.parse('2026-10-06T12:00:00Z')),
    payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: `lead${i}@a.example` }], body: { data: '' } },
  }))
  const client = mockClient(many)
  await runSync({ client, leads: many.map((_, i) => `lead${i}@a.example`), state: {}, now: new Date('2026-10-07T00:00:00Z') })
  assert.equal(client.starred.length, STAR_MAX_PER_RUN)
})

test('gmail client refreshes the token once and pages through results', async () => {
  const calls = []
  const fetchFn = async (url, init = {}) => {
    calls.push(url)
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'a', expires_in: 3600 }))
    const page = url.includes('pageToken') ? { messages: [{ id: '3' }] } : { messages: [{ id: '1' }, { id: '2' }], nextPageToken: 'p2' }
    assert.equal(init.headers.authorization, 'Bearer a')
    return new Response(JSON.stringify(page))
  }
  const c = gmailClient({ clientId: 'i', clientSecret: 's', refreshToken: 'r', fetchFn })
  assert.deepEqual(await c.listIds('in:inbox'), ['1', '2', '3'])
  assert.equal(calls.filter((u) => u.includes('oauth2')).length, 1)
})

test('alert text is escaped and trimmed', () => {
  const t = replyMessage({ lead: 'a@b.example', subject: '<hi>', body: 'x'.repeat(500) })
  assert.match(t, /&lt;hi&gt;/)
  assert.ok(t.endsWith('…'))
})
