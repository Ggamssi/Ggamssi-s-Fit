import { test, expect } from './db.js'

test('DB 저장 오류는 폼을 유지하고 브라우저에 저장하지 않으며 재시도한다', async ({ page, db }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /운동 기록하기/ }).first().click()
  const dialog = page.locator('dialog[open]')
  await dialog.getByLabel('운동 이름').fill('실패 후 재시도')
  await dialog.getByRole('button', { name: '전신', exact: true }).click()
  db.failSave = true
  await dialog.getByRole('button', { name: '기록 저장하기' }).click()
  await expect(dialog.getByRole('alert')).toContainText('DB에 저장하지 못했습니다')
  await expect(dialog.getByLabel('운동 이름')).toHaveValue('실패 후 재시도')
  expect(await page.evaluate(() => localStorage.getItem('teamk.exercise.records.v1'))).toBeNull()
  db.failSave = false
  await dialog.getByRole('button', { name: '기록 저장하기' }).click()
  await expect(dialog).not.toBeVisible()
  expect(db.records).toHaveLength(1)
  expect(db.requests.some((request) => request.url.includes('/auth/'))).toBe(false)
})

test('월별 500행 페이지네이션과 DB 조회 실패 재시도', async ({ page, db }) => {
  const date = new Date().toLocaleDateString('sv-SE')
  db.records = Array.from({ length: 501 }, (_, index) => ({ id: String(index), workout_date: date, name: `운동 ${index}`, category: '웨이트', body_parts: ['하체'], notes: '' }))
  db.failLoad = true
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('마이그레이션')
  await expect(page.getByRole('button', { name: /운동 기록하기/ }).first()).toBeDisabled()
  db.failLoad = false
  await page.getByRole('button', { name: '다시 불러오기' }).click()
  await expect(page.locator('.record-card')).toHaveCount(501)
  expect(db.requests.some((request) => request.url.includes('offset=500'))).toBe(true)
})