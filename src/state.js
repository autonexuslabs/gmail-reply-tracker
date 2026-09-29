import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'

export const loadState = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {})

export function saveState(file, state) {
  writeFileSync(`${file}.tmp`, JSON.stringify(state) + '\n')
  renameSync(`${file}.tmp`, file)
}
