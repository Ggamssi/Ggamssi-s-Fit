import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categories, localDate, validateRecord, normalizeRecord, readLocalRecords, writeLocalRecords, summarizeRecords } from '../src/lib/workouts.js'

const valid = { workout_date: '2026-10-13', name: '백 스쿼트', category: '웨이트', body_parts: ['하체', '코어'], duration: '30', weight: '60', sets: '5', reps: '5', notes: '' }

test('로컬 날짜와 모든 운동 종류, 선택 수치 없이도 기록을 허용한다', () => {
  assert.equal(localDate(new Date(2026, 9, 13, 0, 1)), '2026-10-13')
  for (const category of categories.filter((value) => value !== '크로스핏 와드')) assert.equal(validateRecord({ ...valid, category }, '2026-10-13'), '')
  assert.equal(validateRecord({ ...valid, duration: '', weight: '', sets: '', reps: '' }, '2026-10-13'), '')
})

test('필수 입력, 날짜, 부위, 수치와 길이를 검증한다', () => {
  for (const change of [
    { name: '  ' }, { workout_date: '2026-02-30' }, { workout_date: 'not-a-date' },
    { workout_date: '2026-10-14' }, { name: 'x'.repeat(101) }, { notes: 'x'.repeat(1001) },
    { category: 'unknown' }, { body_parts: [] }, { body_parts: ['알 수 없음'] }, { body_parts: ['하체', '하체'] },
    { weight: -1 }, { duration: 0 }, { duration: 1441 }, { weight: 'NaN' }, { sets: 1.5 }, { reps: 100001 },
  ]) assert.notEqual(validateRecord({ ...valid, ...change }, '2026-10-13'), '', JSON.stringify(change))
})

test('수치를 변환하고 빈 선택 값은 null로 저장한다', () => {
  const result = normalizeRecord({ ...valid, name: ' 백 스쿼트 ', weight: '', notes: ' 메모 ' })
  assert.equal(result.name, '백 스쿼트')
  assert.equal(result.weight, null)
  assert.equal(result.sets, 5)
  assert.equal(result.notes, '메모')
  assert.notEqual(result.body_parts, valid.body_parts)
})

test('기록 저장·복원·삭제와 날짜순 정렬', () => {
  const data = new Map()
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) }
  assert.deepEqual(readLocalRecords(storage), [])
  const records = [{ ...valid, id: 'old', workout_date: '2026-10-12' }, { ...valid, id: 'new' }]
  writeLocalRecords(storage, records)
  assert.deepEqual(readLocalRecords(storage).map((record) => record.id), ['new', 'old'])
  writeLocalRecords(storage, records.filter((record) => record.id !== 'old'))
  assert.equal(readLocalRecords(storage).length, 1)
})

test('운동 일수는 중복 날짜를 제외하고 부위별 횟수를 집계한다', () => {
  const summary = summarizeRecords([valid, { ...valid, category: '유산소', body_parts: ['전신'], duration: null }])
  assert.equal(summary.days, 1)
  assert.equal(summary.count, 2)
  assert.equal(summary.minutes, 30)
  assert.equal(summary.parts.find((item) => item.part === '하체').count, 1)
  assert.equal(summary.parts.find((item) => item.part === '등').count, 0)
})

test('손상된 기록과 저장 공간 오류를 숨기지 않는다', () => {
  assert.throws(() => readLocalRecords({ getItem: () => '{bad' }))
  assert.throws(() => readLocalRecords({ getItem: () => '[{}]' }))
  assert.throws(() => writeLocalRecords({ setItem: () => { throw new Error('Quota exceeded') } }, []))
})
