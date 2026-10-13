import { clearWodResults, normalizeWod, normalizeWodTeam, validateWod, validateWodTeam } from './wod.js'
import { canonicalName, searchName } from './exerciseCatalog.js'

export const categories = ['역도', '웨이트', '유산소', '맨몸', '스트레칭', '기타', '크로스핏 와드']
export const bodyParts = ['전신', '하체', '등', '가슴', '어깨', '팔', '코어']

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function validateRecord(record, today = localDate()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.workout_date)) return '운동 날짜를 선택해주세요.'
  const parsed = new Date(`${record.workout_date}T12:00:00`)
  if (Number.isNaN(parsed.getTime()) || localDate(parsed) !== record.workout_date) return '올바른 날짜를 선택해주세요.'
  if (record.workout_date > today) return '미래 날짜에는 기록할 수 없습니다.'
  const isWod = record.record_type === 'wod'
  if (record.record_type != null && !['exercise', 'wod'].includes(record.record_type)) return '기록 유형을 선택해주세요.'
  const teamError = validateWodTeam(record)
  if (teamError) return teamError
  if (typeof record.name !== 'string' || (!isWod && !record.name.trim()) || record.name.trim().length > 100) return '운동 이름은 1~100자로 입력해주세요.'
  if (isWod) {
    if (record.category !== '크로스핏 와드') return '와드 기록의 운동 종류를 확인해주세요.'
    const wodError = validateWod(record.wod)
    if (wodError) return wodError
  } else if (record.category === '크로스핏 와드') return '크로스핏 와드 기록 유형을 선택해주세요.'
  if (!categories.includes(record.category)) return '운동 종류를 선택해주세요.'
  if (!Array.isArray(record.body_parts) || !record.body_parts.length || record.body_parts.some((part) => !bodyParts.includes(part))) return '운동 부위를 하나 이상 선택해주세요.'
  if (new Set(record.body_parts).size !== record.body_parts.length) return '운동 부위가 중복되었습니다.'
  if (record.set_entries != null) {
    if (isWod) return '와드에는 세트 기록을 사용할 수 없습니다.'
    if (!Array.isArray(record.set_entries) || record.set_entries.length > 1000) return '세트는 최대 1,000개까지 입력할 수 있습니다.'
    for (const [index, entry] of record.set_entries.entries()) {
      const prefix = `${index + 1}세트: `
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some((key) => !['weight', 'reps', 'completed'].includes(key))) return `${prefix}세트 형식을 확인해주세요.`
      if (typeof entry.completed !== 'boolean') return `${prefix}완료 여부를 확인해주세요.`
      if (!['number', 'string'].includes(typeof entry.reps) || String(entry.reps).trim() === '' || !Number.isInteger(Number(entry.reps)) || Number(entry.reps) < 1 || Number(entry.reps) > 100000) return `${prefix}횟수는 1~100,000 정수로 입력해주세요.`
      if (entry.weight !== '' && entry.weight !== null && (!['number', 'string'].includes(typeof entry.weight) || String(entry.weight).trim() === '' || !Number.isFinite(Number(entry.weight)) || Number(entry.weight) < 0 || Number(entry.weight) > 2000)) return `${prefix}중량은 0~2,000kg 또는 빈 값으로 입력해주세요.`
    }
  }
  for (const [key, label, max, integer] of [
    ['duration', '운동 시간', 1440, false], ['weight', '중량', 2000, false],
    ['sets', '세트', 1000, true], ['reps', '횟수', 100000, true],
  ]) {
    if ((isWod || record.set_entries != null) && key !== 'duration') continue
    const value = record[key]
    if (value === '' || value === null || value === undefined) continue
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0 || number > max || (integer && !Number.isInteger(number))) return `${label}은 0보다 크고 ${max} 이하인 ${integer ? '정수' : '숫자'}로 입력해주세요.`
  }
  if (typeof record.notes !== 'string' || record.notes.length > 1000) return '메모는 1,000자 이내로 입력해주세요.'
  return ''
}

export function normalizeRecord(record) {
  const isWod = record.record_type === 'wod'
  const result = { workout_date: record.workout_date, category: record.category, record_type: isWod ? 'wod' : 'exercise', wod: isWod ? normalizeWod(record.wod) : null, name: record.name.trim() || (isWod ? '오늘의 와드' : ''), notes: record.notes.trim(), body_parts: [...record.body_parts], ...normalizeWodTeam(record) }
  result.set_entries = !isWod && record.set_entries != null ? record.set_entries.map((entry) => ({ weight: entry.weight === '' || entry.weight === null ? null : Number(entry.weight), reps: Number(entry.reps), completed: entry.completed })) : null
  for (const key of ['duration', 'weight', 'sets', 'reps']) {
    result[key] = ((isWod || result.set_entries !== null) && key !== 'duration') || record[key] === '' || record[key] === null || record[key] === undefined ? null : Number(record[key])
  }
  return result
}

export function stepNumber(value, direction, min, max, step = 1) {
  const number = value === '' || value == null || !Number.isFinite(Number(value)) ? 0 : Number(value)
  const precision = step === 1 ? 1 : 10
  return Math.min(max, Math.max(min, Math.round((number + direction * step) * precision) / precision))
}

const storageKey = 'teamk.exercise.records.v1'
const favoritesKey = 'ggamssi.exercise.favorites.v1'

export function readFavorites(storage) {
  const favorites = JSON.parse(storage.getItem(favoritesKey) || '[]')
  if (!Array.isArray(favorites) || favorites.some((item) => !item || typeof item.name !== 'string' || typeof item.key !== 'string' || !Array.isArray(item.body_parts))) throw new Error('즐겨찾기를 읽을 수 없습니다.')
  return favorites
}

export function writeFavorites(storage, favorites) {
  storage.setItem(favoritesKey, JSON.stringify(favorites))
}

export function sortHistory(records) {
  return [...records].sort((a, b) => b.workout_date.localeCompare(a.workout_date) || (b.created_at || '').localeCompare(a.created_at || '') || String(a.id).localeCompare(String(b.id)))
}

export function recentExercises(records) {
  const seen = new Set()
  return sortHistory(records).filter((record) => {
    if (record.record_type === 'wod') return false
    const key = record.name.trim().toLowerCase().replace(/\s+/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((record) => ({ name: record.name, category: record.category, body_parts: [...record.body_parts] }))
}

export function previousConfigurations(records, form) {
  const isWod = form.record_type === 'wod'
  const name = form.name.trim() || (isWod ? '오늘의 와드' : '')
  const key = isWod ? searchName(name) : canonicalName(name)
  return sortHistory(records).filter((record) => record.workout_date <= form.workout_date
    && (record.record_type === 'wod') === isWod
    && (isWod ? searchName(record.name) : canonicalName(record.name)) === key)
}

export function copyConfiguration(record) {
  const result = { category: record.category, body_parts: [...record.body_parts] }
  if (record.record_type === 'wod') return { values: { ...result, ...normalizeWodTeam(record), wod: clearWodResults(record.wod), set_entries: null }, warning: '' }
  let warning = ''
  let entries = []
  if (Array.isArray(record.set_entries)) entries = record.set_entries.map((entry) => ({ weight: entry.weight ?? '', reps: entry.reps, completed: false }))
  else if ([record.weight, record.sets, record.reps].every((value) => value !== '' && value != null)
    && Number.isInteger(Number(record.sets)) && Number(record.sets) >= 1 && Number(record.sets) <= 1000
    && Number.isFinite(Number(record.weight)) && Number(record.weight) >= 0 && Number(record.weight) <= 2000
    && Number.isInteger(Number(record.reps)) && Number(record.reps) >= 1 && Number(record.reps) <= 100000) {
    entries = Array.from({ length: Number(record.sets) }, () => ({ weight: Number(record.weight), reps: Number(record.reps), completed: false }))
  } else warning = `구형 상세: 중량 ${record.weight ?? '미입력'}kg · 세트 ${record.sets ?? '미입력'} · 횟수 ${record.reps ?? '미입력'}. 세트 정보가 부족해 직접 입력해주세요.`
  return { values: { ...result, set_entries: entries, weight: '', sets: '', reps: '' }, warning }
}

export function readLocalRecords(storage) {
  const value = storage.getItem(storageKey)
  if (!value) return []
  const records = JSON.parse(value)
  if (!Array.isArray(records) || records.some((record) => !record || typeof record.id !== 'string' || validateRecord(record))) {
    throw new Error('저장된 체험 기록을 읽을 수 없습니다.')
  }
  return records.sort((a, b) => b.workout_date.localeCompare(a.workout_date))
}

export function writeLocalRecords(storage, records) {
  storage.setItem(storageKey, JSON.stringify(records))
}

export function summarizeRecords(records) {
  return {
    days: new Set(records.map((record) => record.workout_date)).size,
    count: records.length,
    minutes: records.reduce((sum, record) => sum + (Number(record.duration) || 0), 0),
    parts: bodyParts.map((part) => ({ part, count: records.filter((record) => record.body_parts.includes(part)).length })),
  }
}
