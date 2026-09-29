// mockClient.js — an in-memory stand-in for src/gmail.js, for the demo and
// tests. It understands the one query shape sync.js sends (after:YYYY/MM/DD).

export function mockClient(messages) {
  const starred = []
  return {
    starred,
    async listIds(q) {
      const after = q.match(/after:(\d{4})\/(\d{2})\/(\d{2})/)
      const since = after ? Date.parse(`${after[1]}-${after[2]}-${after[3]}T00:00:00Z`) : 0
      return messages.filter((m) => Number(m.internalDate) >= since).sort((a, b) => b.internalDate - a.internalDate).map((m) => m.id)
    },
    async getMessage(id) {
      return messages.find((m) => m.id === id)
    },
    async star(threadId) {
      starred.push(threadId)
      return {}
    },
  }
}
