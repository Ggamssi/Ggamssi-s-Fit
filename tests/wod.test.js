import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearWodResults, createWod, normalizeWod, templateWod, validateWod, wodTemplates } from '../src/lib/wod.js'
import { normalizeRecord, readLocalRecords, summarizeRecords, validateRecord, writeLocalRecords } from '../src/lib/workouts.js'

const amrap = () => ({ ...createWod(), prescription: '10 thrusters 35kg / 10 pull-ups', time_limit: '12', rounds: '5', extra_reps: '8' })
const emom = () => ({ ...createWod(), type: 'EMOM', prescription: '홀수 분: 로잉 12cal\n짝수 분: 버피 10회', total_minutes: '15', intervals_completed: '13', status: 'partial', shortfalls: '14, 15분 버피 미달' })
const forTime = () => ({ ...createWod(), type: 'FOR TIME', prescription: '5 rounds: 400m run, 15 squats', target_rounds: '5', time_cap: '15', finish_minutes: '9', finish_seconds: '42' })
const wodRecord = (wod = amrap()) => ({ workout_date: '2026-10-13', name: '', category: '크로스핏 와드', body_parts: ['전신'], duration: '12', weight: '60', sets: '5', reps: '10', notes: '', record_type: 'wod', wod })

test('Fran·Cindy 템플릿은 설정만 제공하고 결과와 변경 내용을 비운다', () => {
  const fran = templateWod(wodTemplates[0], 'Scaled')
  assert.equal(fran.type, 'FOR TIME')
  assert.match(fran.prescription, /21-15-9/)
  assert.match(fran.prescription, /95lb/)
  assert.equal(fran.scaling, 'Scaled')
  assert.equal(fran.modifications, '')
  assert.equal(fran.finish_minutes, '')
  const cindy = templateWod(wodTemplates[1])
  assert.equal(cindy.time_limit, 20)
  assert.equal(cindy.type, 'AMRAP')
  assert.match(cindy.prescription, /풀업 5회/)
  assert.equal(cindy.rounds, '')
  const source = { ...emom(), scaling: 'Scaled', modifications: '로잉 대신 바이크' }
  const cleared = clearWodResults(source)
  assert.equal(cleared.modifications, source.modifications)
  assert.equal(cleared.intervals_completed, '')
  assert.equal(cleared.total_minutes, '15')
  assert.equal(source.intervals_completed, '13')
})

test('와드 모든 방식과 결과를 숫자로 정규화하고 기본 이름을 제공한다', () => {
  for (const wod of [amrap(), emom(), forTime(), { ...createWod(), type: '기타', prescription: '팀 와드', result: '팀 합계 150회' }]) {
    assert.equal(validateRecord(wodRecord(wod), '2026-10-13'), '')
    const record = normalizeRecord(wodRecord(wod))
    assert.equal(record.name, '오늘의 와드')
    assert.equal(validateRecord(record, '2026-10-13'), '')
    assert.equal(record.weight, null)
    assert.equal(record.sets, null)
    assert.equal(record.reps, null)
  }
  assert.equal(normalizeWod(amrap()).rounds, 5)
  assert.equal(normalizeWod(forTime()).finish_seconds, 42)
})

test('AMRAP 필수 설정과 0부터 시작하는 결과를 검증한다', () => {
  assert.equal(validateWod({ ...amrap(), rounds: 0, extra_reps: 0 }), '')
  for (const change of [{ type: 'unknown' }, { prescription: ' ' }, { prescription: 'x'.repeat(3001) }, { scaling: 'unknown' }, { time_limit: '' }, { time_limit: 0 }, { time_limit: 1441 }, { rounds: '' }, { rounds: -1 }, { rounds: 1.5 }, { extra_reps: 100001 }, { extra_reps: true }, { rounds: 'NaN' }, { progress: 'x'.repeat(1001) }]) {
    assert.notEqual(validateWod({ ...amrap(), ...change }), '', JSON.stringify(change))
  }
})

test('Scaled 실제 변경은 필수이며 처방과 분리해 보존한다', () => {
  assert.notEqual(validateWod({ ...amrap(), scaling: 'Scaled' }), '')
  const wod = { ...amrap(), scaling: 'Scaled', modifications: ' 35kg → 25kg, 풀업 → 링로우 ' }
  assert.equal(validateWod(wod), '')
  assert.equal(normalizeWod(wod).modifications, '35kg → 25kg, 풀업 → 링로우')
  assert.equal(normalizeWod({ ...wod, scaling: 'Rx' }).modifications, '')
})

test('EMOM 달성 구간 수, 상태 일치와 미달 내용을 검증한다', () => {
  assert.equal(validateWod({ ...emom(), status: 'completed', intervals_completed: '15', shortfalls: '' }), '')
  assert.equal(validateWod({ ...emom(), status: 'stopped', intervals_completed: 0 }), '')
  for (const change of [{ total_minutes: 0 }, { total_minutes: 1.5 }, { intervals_completed: 16 }, { intervals_completed: -1 }, { intervals_completed: '' }, { status: 'completed' }, { intervals_completed: 15 }, { shortfalls: '' }, { status: 'unknown' }]) {
    assert.notEqual(validateWod({ ...emom(), ...change }), '', JSON.stringify(change))
  }
})

test('FOR TIME 완주 시간과 미완료 진행량을 구분하고 숨겨진 필드를 제거한다', () => {
  for (const status of ['time_cap', 'stopped']) {
    const wod = { ...forTime(), status, rounds: '4', extra_reps: '6', progress: '마지막 러닝 200m' }
    assert.equal(validateWod(wod), '')
    const normalized = normalizeWod(wod)
    assert.equal(normalized.rounds, 4)
    assert.equal(normalized.finish_minutes, undefined)
    assert.equal(validateWod(normalized), '')
  }
  assert.equal(normalizeWod({ ...forTime(), rounds: 4, extra_reps: 6 }).rounds, undefined)
  for (const change of [{ finish_seconds: 60 }, { finish_minutes: '' }, { finish_minutes: 0, finish_seconds: 0 }, { finish_minutes: 15, finish_seconds: 1 }, { finish_minutes: 9.5 }, { target_rounds: 0 }, { time_cap: -1 }, { status: 'unknown' }, { status: 'time_cap', time_cap: '', rounds: 4, extra_reps: 6 }, { status: 'stopped', rounds: 5, extra_reps: 0 }, { status: 'stopped', rounds: '', extra_reps: 0 }]) {
    assert.notEqual(validateWod({ ...forTime(), ...change }), '', JSON.stringify(change))
  }
  assert.equal(validateWod({ ...forTime(), time_cap: '', finish_minutes: 1440, finish_seconds: 0 }), '')
  assert.notEqual(validateWod({ ...forTime(), time_cap: '', finish_minutes: 1440, finish_seconds: 1 }), '')
})

test('기타 결과와 기록 유형 불일치를 거절한다', () => {
  assert.notEqual(validateWod({ ...createWod(), type: '기타', prescription: '와드' }), '')
  for (const change of [{ record_type: 'unknown' }, { record_type: 'exercise' }, { category: '웨이트' }, { wod: null }]) {
    assert.notEqual(validateRecord({ ...wodRecord(), ...change }, '2026-10-13'), '')
  }
})

test('구형 일반 기록과 와드를 함께 복원하고 구성 동작은 중복 집계하지 않는다', () => {
  const data = new Map()
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) }
  const old = { id: 'old', workout_date: '2026-10-13', name: '스쿼트', category: '웨이트', body_parts: ['하체'], duration: 30, notes: '' }
  const records = [old, { ...normalizeRecord(wodRecord()), id: 'wod' }]
  writeLocalRecords(storage, records)
  assert.deepEqual(readLocalRecords(storage), records)
  const summary = summarizeRecords(readLocalRecords(storage))
  assert.equal(summary.count, 2)
  assert.equal(summary.days, 1)
  assert.equal(summary.minutes, 42)
  assert.equal(summary.parts.find((part) => part.part === '전신').count, 1)
  const exercise = normalizeRecord({ ...old, record_type: 'exercise', wod: amrap() })
  assert.equal(exercise.wod, null)
})