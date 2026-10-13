import { bodyParts, categories } from './workouts.js'

const aliases = [
  ['벤치프레스', '벤치 프레스', 'bench press', 'benchpress'],
  ['백 스쿼트', '백스쿼트', 'back squat'],
  ['스쿼트', 'squat'], ['데드리프트', 'deadlift'],
  ['클린 앤 저크', '클린앤저크', 'clean and jerk'],
  ['풀업', 'pull up', 'pull-up'], ['푸시업', 'push up', 'push-up'],
  ['러닝', '달리기', 'running', 'run'],
]
const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'

export function searchName(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

export function canonicalName(value) {
  const name = searchName(value)
  const group = aliases.find((items) => items.some((item) => searchName(item) === name))
  return searchName(group ? group[0] : value)
}

export function initialName(value) {
  return [...String(value || '')].map((letter) => {
    const code = letter.charCodeAt(0) - 0xac00
    return code >= 0 && code <= 11171 ? initials[Math.floor(code / 588)] : letter
  }).join('')
}

export function catalogItem(row) {
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const parts = row.target_parts ?? row.body_parts
  const reason = !name || name.length > 100 ? '이름은 1~100자여야 합니다.'
    : !categories.includes(row.category) || row.category === '크로스핏 와드' ? '지원하지 않는 운동 종류입니다.'
      : !Array.isArray(parts) || !parts.length || parts.some((part) => !bodyParts.includes(part)) || new Set(parts).size !== parts.length ? '추천 부위가 올바르지 않습니다.' : ''
  return { id: row.id, name, category: row.category, body_parts: Array.isArray(parts) ? [...parts] : [], reason }
}

export function favoriteKey(item) {
  return item.id ? `db:${item.id}` : `name:${canonicalName(item.name)}`
}

export function matchesExercise(item, query) {
  const needle = searchName(query)
  const group = aliases.find((items) => items.some((name) => searchName(name) === searchName(item.name))) || [item.name]
  return group.some((name) => searchName(name).includes(needle) || searchName(initialName(name)).includes(needle))
}

export function exerciseSuggestions(catalog, recent, favorites, query = '') {
  if (!searchName(query)) return []
  const seen = new Set()
  const result = []
  for (const [items, source] of [[favorites, '즐겨찾기'], [recent, '최근 운동'], [catalog, '프리셋']]) {
    for (const entry of items) {
      const item = catalog.find((row) => row.id === entry.id || canonicalName(row.name) === canonicalName(entry.name)) || entry
      const key = canonicalName(item.name)
      if (!seen.has(key) && matchesExercise(item, query)) {
        seen.add(key)
        result.push({ ...item, source })
      }
    }
  }
  return result
}