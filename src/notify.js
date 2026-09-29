// notify.js — one Telegram message per new reply. Prints instead when
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function replyMessage(e) {
  const preview = e.body.length > 400 ? `${e.body.slice(0, 400)}…` : e.body
  return `📩 <b>Reply from ${esc(e.lead)}</b>\n${esc(e.subject)}\n\n${esc(preview)}`
}

export async function telegramNotify(e, env = process.env) {
  const text = replyMessage(e)
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log(`\n  ┌ Telegram (dry run)\n${text.replace(/<[^>]+>/g, '').split('\n').map((l) => `  │ ${l}`).join('\n')}\n  └`)
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) console.warn(`[telegram] ${res.status}`)
  } catch (err) {
    console.warn(`[telegram] ${err.message}`) // a failed alert must not fail the sync
  }
}
