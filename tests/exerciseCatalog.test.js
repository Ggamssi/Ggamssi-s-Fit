import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalName, catalogItem, exerciseSuggestions, favoriteKey, matchesExercise } from '../src/lib/exerciseCatalog.js'
import { readFavorites, recentExercises, writeFavorites } from '../src/lib/workouts.js'

const bench = catalogItem({ id: 'bench', name: '벤치프레스', category: '웨이트', target_parts: ['가슴', '팔'] })

test('DB 카탈로그 추천 부위를 매핑하고 이름·종류·부위 오류를 선택 불가로 표시한다', () => {
  assert.deepEqual(bench.body_parts, ['가슴', '팔'])
  assert.equal(bench.reason, '')
  for (const row of [{ name: 'x'.repeat(101) }, { category: 'unknown' }, { target_parts: [] }, { target_parts: ['unknown'] }, { target_parts: ['등', '등'] }]) {
    assert.ok(catalogItem({ name: '운동', category: '웨이트', target_parts: ['등'], ...row }).reason)
  }
})

test('초성·한글·영문 별칭과 자유 입력을 검색하고 중복 추천은 제거한다', () => {
  for (const query of ['ㅂㅊ', '벤치 프레스', 'BENCH PRESS']) assert.ok(matchesExercise(bench, query), query)
  assert.equal(canonicalName('bench press'), canonicalName('벤치프레스'))
  const results = exerciseSuggestions([bench], [{ ...bench, id: undefined, name: 'bench press' }], [{ ...bench, key: favoriteKey(bench) }], '벤치')
  assert.equal(results.length, 1)
  assert.equal(results[0].source, '즐겨찾기')
  assert.equal(exerciseSuggestions([], [{ name: '나의 운동', category: '기타', body_parts: ['전신'] }], [], '나의')[0].name, '나의 운동')
  for (const query of ['', '   ', '\t']) assert.deepEqual(exerciseSuggestions([bench], [bench], [bench], query), [])
  assert.deepEqual(exerciseSuggestions([bench], [bench], [bench], '스쿼트'), [])
})

test('월과 무관한 최근 항목 정렬과 브라우저 즐겨찾기 왕복', () => {
  const records = [{ id: 'a', name: '운동', workout_date: '2026-09-30', created_at: '1', category: '웨이트', body_parts: ['등'] }, { id: 'b', name: '운동', workout_date: '2026-10-01', created_at: '1', category: '역도', body_parts: ['전신'] }]
  assert.equal(recentExercises(records)[0].category, '역도')
  assert.equal(records[0].id, 'a')
  const data = new Map()
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) }
  writeFavorites(storage, [{ ...bench, key: favoriteKey(bench) }])
  assert.equal(readFavorites(storage)[0].key, 'db:bench')
  assert.throws(() => readFavorites({ getItem: () => '{bad' }))
})