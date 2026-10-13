import { normalizeWod, validateWod } from './wod.js'

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
  if (typeof record.name !== 'string' || (!isWod && !record.name.trim()) || record.name.trim().length > 100) return '운동 이름은 1~100자로 입력해주세요.'
  if (isWod) {
    if (record.category !== '크로스핏 와드') return '와드 기록의 운동 종류를 확인해주세요.'
    const wodError = validateWod(record.wod)
    if (wodError) return wodError
  } else if (record.category === '크로스핏 와드') return '크로스핏 와드 기록 유형을 선택해주세요.'
  if (!categories.includes(record.category)) return '운동 종류를 선택해주세요.'
  if (!Array.isArray(record.body_parts) || !record.body_parts.length || record.body_parts.some((part) => !bodyParts.includes(part))) return '운동 부위를 하나 이상 선택해주세요.'
  if (new Set(record.body_parts).size !== record.body_parts.length) return '운동 부위가 중복되었습니다.'
  for (const [key, label, max, integer] of [
    ['duration', '운동 시간', 1440, false], ['weight', '중량', 2000, false],
    ['sets', '세트', 1000, true], ['reps', '횟수', 100000, true],
  ]) {
    if (isWod && key !== 'duration') continue
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
  const result = { ...record, record_type: isWod ? 'wod' : 'exercise', wod: isWod ? normalizeWod(record.wod) : null, name: record.name.trim() || (isWod ? '오늘의 와드' : ''), notes: record.notes.trim(), body_parts: [...record.body_parts] }
  for (const key of ['duration', 'weight', 'sets', 'reps']) {
    result[key] = (isWod && key !== 'duration') || record[key] === '' || record[key] === null || record[key] === undefined ? null : Number(record[key])
  }
  return result
}

const storageKey = 'teamk.exercise.records.v1'

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
