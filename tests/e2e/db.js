import { test as base, expect } from '@playwright/test'

export const test = base.extend({
  db: [async ({ page }, use) => {
    const db = { records: [], catalog: [], requests: [], failSave: false, failLoad: false, failCatalog: false }
    await page.route('https://auth-disabled-test.supabase.co/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      db.requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON() })
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
      if (url.pathname.includes('/auth/')) return route.fulfill({ status: 500, json: { message: '인증 요청 금지' } })
      if (url.pathname.endsWith('/exercises')) {
        if (db.failCatalog) return route.fulfill({ status: 500, json: { message: 'catalog error' } })
        const start = Number(url.searchParams.get('offset') || 0)
        return route.fulfill({ json: db.catalog.slice(start, start + Number(url.searchParams.get('limit') || 500)) })
      }
      expect(url.pathname).toBe('/rest/v1/exercise_records')
      if (request.method() === 'POST') {
        expect(request.postDataJSON().user_id).toBe('local')
        if (db.failSave) return route.fulfill({ status: 403, json: { message: 'denied' } })
        db.records.unshift({ ...request.postDataJSON(), id: crypto.randomUUID(), created_at: new Date().toISOString() })
        return route.fulfill({ status: 201, body: '' })
      }
      expect(url.searchParams.get('user_id')).toBe('eq.local')
      if (request.method() === 'DELETE') {
        const id = url.searchParams.get('id').slice(3)
        const deleted = db.records.filter((record) => record.id === id)
        db.records = db.records.filter((record) => record.id !== id)
        return route.fulfill({ json: deleted.map((record) => ({ id: record.id })) })
      }
      if (db.failLoad) return route.fulfill({ status: 500, json: { message: 'load error' } })
      const filters = url.searchParams.getAll('workout_date')
      const result = db.records.filter((record) => filters.every((filter) => {
        const [op, date] = [filter.slice(0, filter.indexOf('.')), filter.slice(filter.indexOf('.') + 1)]
        return op === 'gte' ? record.workout_date >= date : op === 'lte' ? record.workout_date <= date : record.workout_date < date
      })).sort((a, b) => b.workout_date.localeCompare(a.workout_date) || (b.created_at || '').localeCompare(a.created_at || '') || a.id.localeCompare(b.id))
      const start = Number(url.searchParams.get('offset') || 0)
      return route.fulfill({ json: result.slice(start, start + Number(url.searchParams.get('limit') || 500)) })
    })
    await use(db)
  }, { auto: true }],
})
export { expect }