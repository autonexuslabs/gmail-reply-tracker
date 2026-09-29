// parse.js — pull what we need out of a Gmail API message resource.

export function header(msg, name) {
  const h = (msg.payload?.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h ? h.value : null
}

export const addressOf = (from) => String(from || '').toLowerCase().match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? null

const decode = (data) => Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

/** The first text/plain part, walking nested multiparts. Falls back to the snippet. */
export function bodyText(msg) {
  const stack = [msg.payload]
  while (stack.length) {
    const part = stack.shift()
    if (!part) continue
    if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data)
    stack.push(...(part.parts || []))
  }
  return msg.snippet || ''
}

/** Only the new text of a reply, without the quoted thread below it. */
export function newText(body) {
  return body.split(/\n\s*(on .{5,120} wrote:|-----\s*original message\s*-----|from: .+\n)/i)[0].trim()
}

const BOUNCE_FROM = /^(mailer-daemon|postmaster)@/i
const AUTO_SUBJECT = /(out of (the )?office|automatic reply|auto(matic)?[- ]?reply|on vacation)/i

/**
 * @returns {'bounce'|'auto_reply'|'reply'}
 *   Deliberately coarse: this module finds replies; deciding what a reply
 *   MEANS belongs to the sequence (see email-sequence-sender/src/classify.js).
 */
export function kindOf(msg) {
  const from = addressOf(header(msg, 'From'))
  if (from && BOUNCE_FROM.test(from)) return 'bounce'
  const auto = header(msg, 'Auto-Submitted')
  if ((auto && auto !== 'no') || AUTO_SUBJECT.test(header(msg, 'Subject') || '')) return 'auto_reply'
  return 'reply'
}
