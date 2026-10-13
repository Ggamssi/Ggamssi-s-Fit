import { test, expect } from './db.js'

async function addExercise(page, name, category, parts, details = {}) {
  await page.getByRole('button', { name: /운동 기록하기/ }).first().click()
  const dialog = page.locator('dialog[open]')
  await dialog.getByLabel('운동 이름').fill(name)
  await dialog.getByRole('button', { name: category, exact: true }).click()
  for (const part of parts) await dialog.getByRole('button', { name: part, exact: true }).click()
  if (details['세트 수']) {
    for (let index = 1; index <= Number(details['세트 수']); index++) {
      await dialog.getByRole('button', { name: '＋ 세트 추가' }).click()
      await dialog.getByLabel(`${index}세트 중량 (kg)`, { exact: true }).fill(details['중량 (kg)'])
      await dialog.getByLabel(`${index}세트 횟수`, { exact: true }).fill(details['횟수 (세트당)'])
    }
    details = Object.fromEntries(Object.entries(details).filter(([key]) => !['세트 수', '중량 (kg)', '횟수 (세트당)'].includes(key)))
  }
  for (const [label, value] of Object.entries(details)) await dialog.getByLabel(label, { exact: true }).fill(value)
  await dialog.getByRole('button', { name: '기록 저장하기' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

test('여러 종류와 부위를 기록하고 필터, 요약, 새로고침, 삭제를 확인한다', async ({ page }) => {
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveTitle('Ggamssi`s-Fit | 운동 다이어리')
  await expect(page.getByRole('link', { name: 'Ggamssi-Fit 홈', exact: true })).toBeVisible()
  await expect(page.locator('.footer-brand')).toContainText('Ggamssi`s-Fit')
  await expect(page.getByText('공용 DB 모드', { exact: true })).toBeVisible()
  await addExercise(page, '백 스쿼트', '웨이트', ['하체', '코어'], { '운동 시간 (분)': '30', '중량 (kg)': '60', '세트 수': '5', '횟수 (세트당)': '5' })
  await addExercise(page, '러닝', '유산소', ['전신'], { '운동 시간 (분)': '20' })
  await expect(page.locator('.stat-card').nth(0).locator('strong')).toHaveText('1')
  await expect(page.locator('.stat-card').nth(1).locator('strong')).toHaveText('2')
  await expect(page.locator('.stat-card').nth(2).locator('strong')).toHaveText('50')
  await expect(page.locator('.record-card').filter({ hasText: '백 스쿼트' })).toContainText('코어')
  await page.getByRole('button', { name: '유산소', exact: true }).click()
  await expect(page.getByRole('heading', { name: '백 스쿼트', exact: true })).not.toBeVisible()
  await expect(page.getByRole('heading', { name: '러닝', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.record-card')).toHaveCount(2)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '백 스쿼트 기록 삭제', exact: true }).click()
  await expect(page.locator('.record-card')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.record-card')).toHaveCount(1)
  expect(runtimeErrors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('부위 없는 기록을 거절하고 입력을 유지한다', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /운동 기록하기/ }).first().click()
  const dialog = page.locator('dialog[open]')
  await dialog.getByLabel('운동 이름').fill('클린 앤 저크')
  await dialog.getByRole('button', { name: '역도', exact: true }).click()
  await dialog.getByRole('button', { name: '기록 저장하기' }).click()
  await expect(dialog.getByRole('alert')).toContainText('운동 부위를 하나 이상')
  await expect(dialog.getByLabel('운동 이름')).toHaveValue('클린 앤 저크')
  await dialog.getByRole('button', { name: '전신', exact: true }).click()
  await dialog.getByRole('button', { name: '기록 저장하기' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.record-card')).toContainText('역도')
})

test('과거 기록을 월별·날짜별로 조회한다', async ({ page }) => {
  await page.goto('/')
  await addExercise(page, '걷기', '유산소', ['하체'], { '운동 날짜 *': '2025-01-15' })
  await expect(page.getByLabel('조회할 기록 월')).toHaveValue('2025-01')
  await page.getByRole('button', { name: /1월 15일.*기록 있음/ }).click()
  await expect(page.locator('.date-filter')).toContainText('1월 15일')
  await expect(page.locator('.record-card')).toHaveCount(1)
  await page.getByRole('button', { name: /1월 14일/ }).click()
  await expect(page.locator('.record-card')).toHaveCount(0)
  await page.getByRole('button', { name: '날짜 필터 해제' }).click()
  await expect(page.locator('.record-card')).toHaveCount(1)
})

test('손상된 기존 브라우저 기록을 읽거나 덮어쓰지 않는다', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('teamk.exercise.records.v1', '{bad'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: /운동 기록하기/ }).first()).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('teamk.exercise.records.v1'))).toBe('{bad')
})
