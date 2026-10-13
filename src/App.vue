<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { authEnabled, publicOwner, recordColumns, recordsTable, supabase } from './lib/supabase.js'
import { bodyParts, categories, copyConfiguration, localDate, normalizeRecord, previousConfigurations, readFavorites, recentExercises, stepNumber, summarizeRecords, validateRecord, writeFavorites } from './lib/workouts.js'
import { canonicalName, catalogItem, exerciseSuggestions, favoriteKey } from './lib/exerciseCatalog.js'
import { createWod, templateWod, wodTemplates } from './lib/wod.js'
import WodFields from './components/WodFields.vue'
import WodDetails from './components/WodDetails.vue'

const today = ref(localDate())
const selectedMonth = ref(today.value.slice(0, 7))
const selectedCategory = ref('전체')
const selectedDay = ref('')
const records = ref([])
const user = ref(null)
const loading = ref(true)
const busy = ref(false)
const loadFailed = ref(false)
const catalog = ref([])
const catalogError = ref('')
const history = ref([])
const historyError = ref('')
const favorites = ref([])
const favoritesError = ref('')
const searchOpen = ref(false)
const searchIndex = ref(-1)
const copying = ref(false)
const copyNotice = ref('')
const copyCandidates = ref([])
const favoritesFailed = ref(false)
let mappedName = ''
let historyVersion = 0
const error = ref('')
const notice = ref('')
const formError = ref('')
const authError = ref('')
const recordDialog = ref(null)
const authDialog = ref(null)
const nameInput = ref(null)
const emailInput = ref(null)
const authMode = ref('login')
const credentials = reactive({ email: '', password: '' })
const form = reactive({ workout_date: today.value, name: '', category: '웨이트', body_parts: [], duration: '', weight: '', sets: '', reps: '', set_entries: [], notes: '', record_type: 'exercise', wod: createWod() })
let subscription
let requestVersion = 0
let clock

const monthRecords = computed(() => records.value.filter((record) => record.workout_date.startsWith(selectedMonth.value)))
const summary = computed(() => summarizeRecords(monthRecords.value))
const visibleRecords = computed(() => monthRecords.value.filter((record) =>
  (selectedCategory.value === '전체' || record.category === selectedCategory.value)
  && (!selectedDay.value || record.workout_date === selectedDay.value),
))
const groups = computed(() => {
  const result = new Map()
  for (const record of visibleRecords.value) {
    if (!result.has(record.workout_date)) result.set(record.workout_date, [])
    result.get(record.workout_date).push(record)
  }
  return [...result.entries()].sort(([a], [b]) => b.localeCompare(a))
})
const calendar = computed(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const start = new Date(year, month - 1, 1).getDay()
  const count = new Date(year, month, 0).getDate()
  const dates = Array.from({ length: count }, (_, index) => `${selectedMonth.value}-${String(index + 1).padStart(2, '0')}`)
  return [...Array(start).fill(null), ...dates]
})
const recordedDays = computed(() => new Set(monthRecords.value.map((record) => record.workout_date)))
const topPart = computed(() => [...summary.value.parts].sort((a, b) => b.count - a.count)[0])
const monthLabel = computed(() => `${Number(selectedMonth.value.slice(5))}월의 움직임`)
const suggestions = computed(() => exerciseSuggestions(catalog.value, recentExercises(history.value).map(catalogItem), favorites.value, form.name))
const searchVisible = computed(() => form.record_type === 'exercise' && searchOpen.value && !!form.name.trim())
const currentExercise = computed(() => catalog.value.find((item) => canonicalName(item.name) === canonicalName(form.name)) || catalogItem({ name: form.name, category: form.category, body_parts: form.body_parts }))
const isFavorite = computed(() => favorites.value.some((item) => item.key === favoriteKey(currentExercise.value)))
const templates = computed(() => wodTemplates.filter((item) => !form.name.trim() || [item.name, ...item.aliases].some((name) => name.toLowerCase().includes(form.name.trim().toLowerCase()))))

function chooseTemplate(template) {
  if (busy.value) return
  if (Object.entries(form.wod).some(([key, value]) => !['type', 'scaling', 'status'].includes(key) && value !== '' && value != null)
    && !window.confirm('작성한 와드 구성을 템플릿으로 교체할까요? 수행 결과와 실제 변경 내용은 초기화됩니다.')) return
  const scaling = form.wod.scaling
  form.name = template.name
  form.wod = templateWod(template, scaling)
  formError.value = ''
}

function chooseExercise(item) {
  if (item.reason) return
  form.name = item.name
  form.category = item.category
  form.body_parts = [...item.body_parts]
  mappedName = canonicalName(item.name)
  searchOpen.value = false
  searchIndex.value = -1
}

function confirmName() {
  if (form.record_type !== 'exercise' || mappedName === canonicalName(form.name)) return
  const item = catalog.value.find((entry) => canonicalName(entry.name) === canonicalName(form.name))
  if (item && !item.reason) chooseExercise(item)
}

function nameChanged(event) {
  form.name = event.target.value
  searchOpen.value = form.record_type === 'exercise'
  searchIndex.value = -1
}

function nameKeydown(event) {
  if (event.isComposing || event.keyCode === 229) return
  if (form.record_type !== 'exercise' || !form.name.trim()) return
  if (event.key === 'Escape') {
    if (searchOpen.value) event.preventDefault()
    searchOpen.value = false
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    searchOpen.value = true
    const length = suggestions.value.length
    searchIndex.value = length ? (searchIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + length) % length : -1
  } else if (event.key === 'Enter' && searchOpen.value) {
    event.preventDefault()
    const item = suggestions.value[searchIndex.value]
    if (item) chooseExercise(item)
    else { confirmName(); searchOpen.value = false }
  }
}

function toggleFavorite() {
  if (favoritesFailed.value) return
  const item = currentExercise.value
  if (item.reason) { favoritesError.value = item.reason; return }
  const key = favoriteKey(item)
  const result = isFavorite.value ? favorites.value.filter((entry) => entry.key !== key) : [...favorites.value, { ...item, key }]
  try {
    writeFavorites(window.localStorage, result)
    favorites.value = result
    favoritesError.value = ''
  } catch { favoritesError.value = '즐겨찾기를 저장하지 못했습니다. 브라우저 저장소 권한을 확인해주세요.' }
}

async function loadPrevious() {
  if (busy.value || copying.value) return
  copying.value = true
  copyNotice.value = ''
  copyCandidates.value = []
  const selection = { name: form.name, record_type: form.record_type, workout_date: form.workout_date }
  try {
    if (!await loadHistory(selection.workout_date)) { copyNotice.value = '이전 구성을 DB에서 불러오지 못했습니다. 다시 시도해주세요.'; return }
    if (Object.keys(selection).some((key) => form[key] !== selection[key])) return
    const candidates = previousConfigurations(history.value, selection)
    if (!candidates.length) { copyNotice.value = '선택 날짜 이전에 같은 운동의 기록이 없습니다.'; return }
    if (form.record_type === 'wod') copyCandidates.value = candidates
    else applyPrevious(candidates[0])
  } finally { copying.value = false }
}

function applyPrevious(record) {
  if (busy.value) return
  const detail = record.record_type === 'wod' ? `\n${record.wod.prescription}` : ''
  if (!window.confirm(`${record.workout_date}의 ${record.name} 구성을 불러올까요?${detail}\n현재 구성은 교체되고 수행 결과는 초기화됩니다. 날짜·운동 시간·메모는 유지됩니다.`)) return
  const copied = copyConfiguration(record)
  Object.assign(form, copied.values)
  if (form.record_type === 'exercise') form.set_entries = form.set_entries.map((entry) => ({ ...entry, completed: true }))
  mappedName = canonicalName(form.name)
  copyNotice.value = `${record.workout_date} 구성 불러옴. ${copied.warning || '오늘의 수행 내용을 확인해주세요.'}`
  copyCandidates.value = []
  formError.value = ''
}

async function loadHistory(date = today.value) {
  const version = ++historyVersion
  historyError.value = ''
  try {
    if (!supabase) throw new Error('DB 미설정')
    const result = []
    for (let offset = 0; ; offset += 500) {
      const { data, error: queryError } = await supabase.from(recordsTable).select(recordColumns)
        .eq('user_id', publicOwner).lte('workout_date', date)
        .order('workout_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
      if (version !== historyVersion) return false
      if (queryError) throw queryError
      result.push(...data)
      if (data.length < 500) break
    }
    history.value = result
    return true
  } catch {
    if (version === historyVersion) { history.value = []; historyError.value = '최근 운동 이력을 불러오지 못했습니다. 다시 시도해주세요.' }
    return false
  }
}

function displayDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })
}

async function loadCatalog() {
  catalogError.value = ''
  try {
    if (!supabase) throw new Error('DB 미설정')
    const result = []
    for (let offset = 0; ; offset += 500) {
      const { data, error: queryError } = await supabase.from('exercises').select('id,name,category,target_parts,created_at')
        .order('name').order('id').range(offset, offset + 499)
      if (queryError) throw queryError
      result.push(...data)
      if (data.length < 500) break
    }
    catalog.value = result.map(catalogItem)
  } catch {
    catalog.value = []
    catalogError.value = '운동 목록을 불러오지 못했습니다. 직접 이름 입력은 가능합니다.'
  }
}

async function loadRecords() {
  const version = ++requestVersion
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    let result = []
    if (!supabase) throw new Error('DB 미설정')
    {
      const [year, month] = selectedMonth.value.split('-').map(Number)
      const end = localDate(new Date(year, month, 1))
      for (let offset = 0; ; offset += 500) {
        const { data, error: queryError } = await supabase.from(recordsTable).select(recordColumns)
          .eq('user_id', publicOwner).gte('workout_date', `${selectedMonth.value}-01`).lt('workout_date', end)
          .order('workout_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
          .range(offset, offset + 499)
        if (queryError) throw queryError
        if (version !== requestVersion) return
        result.push(...data)
        if (data.length < 500) break
      }
    }
    if (version === requestVersion) records.value = result
  } catch {
    if (version === requestVersion) {
      records.value = []
      loadFailed.value = true
      error.value = supabase ? '기록을 불러오지 못했습니다. Supabase 연결·공용 모드 마이그레이션·RLS 설정을 확인하고 다시 시도해주세요.' : 'DB 미설정: Supabase URL과 공개 키를 설정해주세요. 기록 저장은 중단되며 기존 브라우저 기록은 그대로 보존됩니다.'
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function openRecord() {
  today.value = localDate()
  if (!supabase || loading.value || loadFailed.value) return
  Object.assign(form, { workout_date: selectedDay.value || today.value, name: '', category: '웨이트', body_parts: [], duration: '', weight: '', sets: '', reps: '', set_entries: [], notes: '', record_type: 'exercise', wod: createWod() })
  formError.value = ''
  mappedName = ''
  searchOpen.value = false
  searchIndex.value = -1
  copyNotice.value = ''
  copyCandidates.value = []
  loadHistory(form.workout_date)
  recordDialog.value.showModal()
  await nextTick()
  nameInput.value.focus()
}

function togglePart(part) {
  form.body_parts = form.body_parts.includes(part) ? form.body_parts.filter((value) => value !== part) : [...form.body_parts, part]
}

function selectRecordType(type) {
  form.record_type = type
  form.category = type === 'wod' ? '크로스핏 와드' : '웨이트'
  form.weight = ''
  form.sets = ''
  form.reps = ''
  form.set_entries = type === 'wod' ? null : []
  formError.value = ''
  searchOpen.value = false
  mappedName = ''
}

async function saveRecord() {
  if (busy.value) return
  formError.value = validateRecord(form)
  if (formError.value) return
  if (loadFailed.value || loading.value) {
    formError.value = '기록 목록을 정상적으로 불러온 후 다시 저장해주세요.'
    return
  }
  busy.value = true
  try {
    const payload = normalizeRecord(form)
    if (!supabase) throw new Error('DB 미설정')
    const { error: saveError } = await supabase.from(recordsTable).insert({ ...payload, user_id: publicOwner })
    if (saveError) throw saveError
    selectedDay.value = ''
    selectedCategory.value = '전체'
    const month = payload.workout_date.slice(0, 7)
    if (selectedMonth.value !== month) selectedMonth.value = month
    else if (supabase) await loadRecords()
    notice.value = '오늘의 노력이 기록되었습니다. 잘하셨어요!'
    recordDialog.value.close()
  } catch {
    formError.value = 'DB에 저장하지 못했습니다. 연결·테이블 권한을 확인하고 다시 시도해주세요. 입력 내용은 유지됩니다.'
  } finally {
    busy.value = false
  }
}

async function deleteRecord(record) {
  if (busy.value || !window.confirm(`${record.name} 기록을 삭제할까요? 삭제한 기록은 복원할 수 없습니다.`)) return
  busy.value = true
  error.value = ''
  try {
    if (!supabase) throw new Error('DB 미설정')
    const { data, error: deleteError } = await supabase.from(recordsTable).delete().eq('id', record.id).eq('user_id', publicOwner).select('id')
    if (deleteError || !data.length) throw deleteError || new Error('삭제 권한이 없습니다.')
    records.value = records.value.filter((item) => item.id !== record.id)
    notice.value = '운동 기록을 삭제했습니다.'
  } catch {
    error.value = '기록을 삭제하지 못했습니다. 다시 시도해주세요.'
  } finally {
    busy.value = false
  }
}

async function openAuth() {
  authError.value = ''
  credentials.password = ''
  authDialog.value.showModal()
  await nextTick()
  emailInput.value.focus()
}

async function submitAuth() {
  if (!authEnabled) {
    authError.value = '회원가입·로그인 기능은 현재 일시 중단되어 있습니다.'
    return
  }
  if (busy.value) return
  busy.value = true
  authError.value = ''
  try {
    const method = authMode.value === 'login' ? 'signInWithPassword' : 'signUp'
    const { data, error: signError } = await supabase.auth[method]({ email: credentials.email.trim(), password: credentials.password })
    if (signError) throw signError
    credentials.password = ''
    authDialog.value.close()
    notice.value = data.session ? '로그인되었습니다. 나만의 운동 기록을 시작하세요.' : '가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인해주세요.'
  } catch {
    authError.value = authMode.value === 'login' ? '로그인하지 못했습니다. 이메일·비밀번호와 연결 상태를 확인해주세요.' : '가입하지 못했습니다. 이메일과 비밀번호(8자 이상)를 확인해주세요.'
  } finally {
    busy.value = false
  }
}

async function logout() {
  busy.value = true
  const { error: signError } = await supabase.auth.signOut()
  if (signError) error.value = '로그아웃하지 못했습니다. 다시 시도해주세요.'
  busy.value = false
}

watch(selectedMonth, (value, previous) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    selectedMonth.value = previous || today.value.slice(0, 7)
    return
  }
  selectedDay.value = ''
  loadRecords()
})

onMounted(async () => {
  clock = window.setInterval(() => { today.value = localDate() }, 60000)
  if (authEnabled && supabase) {
    subscription = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      if (nextUser?.id !== user.value?.id) {
        user.value = nextUser
        records.value = []
        ++requestVersion
        recordDialog.value?.close()
        window.setTimeout(loadRecords, 0)
      }
    }).data.subscription
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) error.value = '로그인 상태를 확인하지 못했습니다. 다시 로그인해주세요.'
    user.value = data.session?.user ?? null
  }
  try { favorites.value = readFavorites(window.localStorage) } catch { favoritesFailed.value = true; favoritesError.value = '즐겨찾기를 읽을 수 없습니다. 기존 저장값은 덮어쓰지 않습니다.' }
  await Promise.all([loadRecords(), loadCatalog(), loadHistory()])
})

onUnmounted(() => {
  subscription?.unsubscribe()
  window.clearInterval(clock)
  ++requestVersion
  ++historyVersion
})
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" href="#" aria-label="Ggamssi-Fit 홈"><span class="brand-mark">G<span>.</span></span><span>Ggamssi-<span class="brand-k">Fit</span><small>TRAIN TOGETHER. GROW TOGETHER.</small></span></a>
      <nav aria-label="주 메뉴"><a class="nav-active" href="#journal">운동 다이어리</a><a href="#balance">나의 운동 밸런스</a></nav>
      <div class="account">
        <span v-if="user" class="account-email">{{ user.email }}</span><button class="button button-small button-outline" :disabled="busy" @click="user ? logout() : openAuth()">{{ user ? '로그아웃' : '로그인 / 가입' }}</button>
        <span class="demo-badge"><span></span> {{ supabase ? '공용 DB 모드' : 'DB 미설정' }}</span>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="hero-copy"><p class="eyebrow"><span></span> YOUR EVERYDAY TRAINING LOG</p><h1>오늘의 움직임이,<br>내일의 <em>나를 만듭니다.</em></h1><p class="hero-description">무엇을 했는지, 어디를 움직였는지.<br>작은 노력도 놓치지 않는 나만의 운동 다이어리.</p><button class="button button-lime" :disabled="loading || loadFailed || busy" @click="openRecord"><span class="plus">＋</span> 운동 기록하기 <span class="arrow">↗</span></button></div>
        <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-cross">+</div><div class="art-word">KEEP<br>MOVING<span>.</span></div><span class="art-bottom">ONE DAY. ONE REP. ONE STEP FORWARD.</span><span class="art-index">Ggamssi`s-Fit / TRAINING JOURNAL</span></div>
      </section>

      <div class="mode-note"><span class="note-icon">ⓘ</span><p v-if="supabase"><strong>공용 DB 체험 모드입니다.</strong> 모든 접속자가 같은 local 기록을 조회·추가·삭제할 수 있습니다. 개인·민감 정보를 기록하지 마세요. 로그인은 중단되어 있으며 기존 브라우저 기록은 삭제하거나 자동 업로드하지 않습니다.</p><p v-else><strong>DB 미설정</strong> 상태로 기록을 저장할 수 없습니다. 환경변수를 설정해주세요. 기존 브라우저 기록은 보존됩니다.</p></div>
      <div v-if="error" class="message message-error" role="alert">{{ error }} <button v-if="loadFailed" class="text-button" @click="loadRecords">다시 불러오기</button></div>
      <div v-if="notice" class="message message-success" role="status">{{ notice }}<button class="text-button" aria-label="알림 닫기" @click="notice = ''">×</button></div>

      <section class="overview" aria-label="월별 운동 요약">
        <div class="overview-heading"><div><p class="eyebrow">MY TRAINING OVERVIEW</p><h2>{{ monthLabel }}</h2></div><label class="month-control"><span>기록 월</span><input v-model="selectedMonth" type="month" :max="today.slice(0, 7)" required aria-label="조회할 기록 월"></label></div>
        <div class="stats-grid"><article class="stat-card"><span class="stat-label">운동한 날 <span>↗</span></span><p><strong>{{ summary.days }}</strong><span>일</span></p><small>하루의 여러 운동은 1일로 계산해요</small></article><article class="stat-card"><span class="stat-label">기록한 운동 <span>≡</span></span><p><strong>{{ summary.count }}</strong><span>개</span></p><small>역도부터 유산소까지, 모든 움직임</small></article><article class="stat-card"><span class="stat-label">누적 운동 시간 <span>◷</span></span><p><strong>{{ Number(summary.minutes.toFixed(1)) }}</strong><span>분</span></p><small>직접 입력한 운동 시간을 더했어요</small></article><article class="stat-card stat-highlight"><span class="stat-label">가장 많이 기록한 부위 <span>◎</span></span><p><strong class="part-value">{{ topPart?.count ? topPart.part : '아직 없음' }}</strong></p><small>{{ topPart?.count ? `${topPart.count}개의 운동에 선택된 부위` : '첫 운동으로 밸런스를 채워보세요' }}</small></article></div>
      </section>

      <div class="content-grid">
        <section id="journal" class="journal">
          <div class="section-heading"><div><p class="eyebrow">MY WORKOUT JOURNAL</p><h2>나의 운동 기록 <span class="count-badge">{{ visibleRecords.length }}</span></h2></div><button class="text-button" :disabled="loading || busy || loadFailed" @click="openRecord">＋ 기록 추가</button></div>
          <div class="filter-tabs" aria-label="운동 종류 필터"><button v-for="category in ['전체', ...categories]" :key="category" :class="{ active: selectedCategory === category }" :aria-pressed="selectedCategory === category" @click="selectedCategory = category">{{ category }}</button></div>
          <div v-if="selectedDay" class="date-filter">{{ displayDate(selectedDay) }}<button class="text-button" @click="selectedDay = ''">날짜 필터 해제 ×</button></div>
          <div v-if="loading" class="empty-state" role="status"><span class="empty-symbol">◌</span><h3>기록을 불러오고 있어요</h3></div>
          <div v-else-if="loadFailed" class="empty-state"><span class="empty-symbol">!</span><h3>기록을 불러오지 못했어요</h3><p>위의 안내를 확인한 뒤 다시 시도해주세요.</p></div>
          <div v-else-if="!groups.length" class="empty-state"><span class="empty-symbol">＋</span><h3>{{ selectedDay || selectedCategory !== '전체' ? '선택한 조건의 기록이 없어요' : '첫 움직임을 기록해볼까요?' }}</h3><p>스쿼트 5세트, 가벼운 러닝 20분.<br>어떤 운동이든 나의 기록이 됩니다.</p><button class="button button-dark" :disabled="busy" @click="openRecord">운동 기록하기 ↗</button></div>
          <div v-else class="record-groups">
            <article v-for="[date, dayRecords] in groups" :key="date" class="day-group">
              <div class="day-heading"><h3>{{ displayDate(date) }} <span v-if="date === today" class="today-label">TODAY</span></h3><span>{{ dayRecords.length }}개의 운동</span></div>
              <div v-for="record in dayRecords" :key="record.id" class="record-card">
                <div class="record-symbol" :class="`category-${categories.indexOf(record.category)}`">{{ record.category === '유산소' ? '↗' : record.category === '스트레칭' ? '〰' : '＋' }}</div>
                <div class="record-main">
                  <div class="record-title"><h4>{{ record.name }}</h4><span class="category-label">{{ record.category }}</span></div>
                  <div class="part-tags"><span v-for="part in record.body_parts" :key="part">{{ part }}</span></div>
                  <WodDetails v-if="record.record_type === 'wod'" :wod="record.wod" />
                  <ul v-if="record.set_entries?.length" class="record-sets"><li v-for="(entry, index) in record.set_entries" :key="index">{{ index + 1 }}세트 · {{ entry.weight === null ? '중량 미입력' : `${entry.weight}kg` }} × {{ entry.reps }}회 · {{ entry.completed ? '완료 ✓' : '미완료' }}</li></ul>
                  <p v-if="record.duration || record.weight || record.sets || record.reps" class="record-metrics"><span v-if="record.duration">{{ record.duration }}분</span><span v-if="record.weight">{{ record.weight }}kg</span><span v-if="record.sets">{{ record.sets }}세트</span><span v-if="record.reps">{{ record.reps }}회{{ record.sets ? ' / 세트' : '' }}</span></p>
                  <p v-if="record.notes" class="record-notes">{{ record.notes }}</p>
                </div>
                <button class="delete-button" :disabled="busy" :aria-label="`${record.name} 기록 삭제`" @click="deleteRecord(record)">×</button>
              </div>
            </article>
          </div>
        </section>

        <aside class="sidebar">
          <section class="calendar-panel"><div class="section-heading"><h3>{{ Number(selectedMonth.slice(5)) }}월 운동 캘린더</h3><span class="calendar-legend"><i></i> 기록한 날</span></div><div class="calendar-weekdays"><span v-for="day in ['일', '월', '화', '수', '목', '금', '토']" :key="day">{{ day }}</span></div><div class="calendar-grid"><template v-for="(date, index) in calendar" :key="date || `blank-${index}`"><button v-if="date" :disabled="date > today" :class="{ recorded: recordedDays.has(date), selected: selectedDay === date, 'is-today': date === today }" :aria-label="`${displayDate(date)}${recordedDays.has(date) ? ', 기록 있음' : ''}`" :aria-pressed="selectedDay === date" @click="selectedDay = selectedDay === date ? '' : date">{{ Number(date.slice(-2)) }}<i v-if="recordedDays.has(date)"></i></button><span v-else></span></template></div><p class="calendar-hint">날짜를 누르면 그날의 기록을 볼 수 있어요.</p></section>
          <section id="balance" class="balance-panel"><p class="eyebrow">BODY BALANCE</p><h3>어디를 움직였나요?</h3><p class="panel-description">이번 달 직접 선택한 부위별 운동 기록</p><div class="body-bars"><div v-for="item in summary.parts" :key="item.part" class="body-row"><span>{{ item.part }}</span><div class="bar-track"><div :style="{ width: `${summary.count ? item.count / summary.count * 100 : 0}%` }"></div></div><span class="bar-count">{{ item.count }}<small>회</small></span></div></div><p class="balance-note">한 운동에 여러 부위를 선택할 수 있어요.<br>부위별 횟수는 운동 효과나 강도를 의미하지 않아요.</p></section>
          <div class="quote-panel"><span>“</span><p>완벽한 하루보다,<br><strong>꾸준한 한 걸음.</strong></p><small>YOU VS. YESTERDAY</small></div>
        </aside>
      </div>
    </main>

    <footer><a class="footer-brand" href="#">Ggamssi`s-Fit<span>.</span></a><span>나의 움직임을 기록하고, 나의 성장을 만들어가세요.</span><small>TRAINING JOURNAL</small></footer>

    <dialog ref="recordDialog" class="form-dialog" @cancel="busy && $event.preventDefault()">
      <div class="dialog-heading"><div><p class="eyebrow">MAKE TODAY COUNT</p><h2>운동 기록하기</h2></div><button class="close-button" :disabled="busy" aria-label="기록 창 닫기" @click="recordDialog.close()">×</button></div>
      <p class="dialog-description">오늘 어떤 움직임을 만들었나요? 운동 하나씩 남겨보세요.</p>
      <form @submit.prevent="saveRecord">
        <fieldset :disabled="busy"><legend>기록 유형</legend><div class="selection-chips"><button type="button" :class="{ selected: form.record_type === 'exercise' }" :aria-pressed="form.record_type === 'exercise'" @click="selectRecordType('exercise')">일반 운동</button><button type="button" :class="{ selected: form.record_type === 'wod' }" :aria-pressed="form.record_type === 'wod'" @click="selectRecordType('wod')">크로스핏 와드</button></div></fieldset>
        <label>운동 날짜 <span class="required">*</span><input v-model="form.workout_date" type="date" :max="today" required :disabled="busy"></label>
        <div class="exercise-search">
        <div class="exercise-combobox">
        <label>{{ form.record_type === 'wod' ? '와드 이름' : '운동 이름' }} <span v-if="form.record_type === 'exercise'" class="required">*</span><input ref="nameInput" :value="form.name" :placeholder="form.record_type === 'wod' ? '이름이 없으면 오늘의 와드로 저장해요' : '운동 검색 · 초성 또는 직접 이름 입력'" maxlength="100" :required="form.record_type === 'exercise'" :disabled="busy" :role="form.record_type === 'exercise' ? 'combobox' : null" :aria-expanded="form.record_type === 'exercise' ? searchVisible : null" :aria-controls="searchVisible ? 'exercise-options' : null" :aria-activedescendant="searchVisible && searchIndex >= 0 ? `exercise-option-${searchIndex}` : null" aria-autocomplete="list" autocomplete="off" @focus="searchOpen = form.record_type === 'exercise'" @input="nameChanged" @compositionend="nameChanged" @blur="confirmName(); searchOpen = false" @keydown="nameKeydown"></label>
          <div v-if="searchVisible" id="exercise-options" class="exercise-options" role="listbox" aria-label="운동 추천">
            <button v-for="(item, index) in suggestions" :id="`exercise-option-${index}`" :key="favoriteKey(item)" type="button" role="option" :aria-selected="searchIndex === index" :disabled="busy || !!item.reason" @mousedown.prevent @click="chooseExercise(item)">{{ item.name }} <small>{{ item.source }} · {{ item.reason || `${item.category} / ${item.body_parts.join('·')}` }}</small></button>
            <p v-if="!suggestions.length" class="field-hint">추천 운동이 없습니다. 입력한 이름 그대로 기록할 수 있습니다.</p>
          </div>
        </div>
        <template v-if="form.record_type === 'exercise'">
          <button type="button" class="text-button" :disabled="busy || favoritesFailed || !form.name.trim()" :aria-pressed="isFavorite" @click="toggleFavorite">{{ isFavorite ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기 추가' }}</button>
          <p v-if="catalogError" class="field-hint" role="status">{{ catalogError }} <button type="button" class="text-button" @click="loadCatalog">목록 다시 불러오기</button></p>
          <p v-if="historyError" class="field-hint" role="status">{{ historyError }} <button type="button" class="text-button" @click="loadHistory(form.workout_date)">이력 다시 불러오기</button></p>
          <p v-if="favoritesError" class="field-hint" role="status">{{ favoritesError }}</p>
        </template>
        </div>
        <div v-if="form.record_type === 'wod'" class="template-options" aria-label="와드 템플릿">
          <button v-for="template in templates" :key="template.name" type="button" class="button button-outline" :disabled="busy" @click="chooseTemplate(template)">{{ template.name }} 템플릿 · {{ template.type }}</button>
          <p class="field-hint">템플릿은 버튼을 눌렀을 때만 적용됩니다. 수행 기준과 실제 중량을 직접 확인해주세요.</p>
        </div>
        <button type="button" class="button button-outline" :disabled="busy || copying || (form.record_type === 'exercise' && !form.name.trim())" @click="loadPrevious">{{ copying ? '이전 구성 조회 중…' : '이전 구성 불러오기' }}</button>
        <p v-if="copyNotice" class="field-hint" role="status">{{ copyNotice }}</p>
        <div v-if="copyCandidates.length" class="copy-candidates" aria-label="이전 와드 구성 후보"><p class="field-hint">같은 이름의 와드도 처방이 다를 수 있습니다. 구성을 확인하고 선택하세요.</p><button v-for="record in copyCandidates" :key="record.id" type="button" class="button button-outline" :disabled="busy" @click="applyPrevious(record)">{{ record.workout_date }} · {{ record.wod.type }} · {{ record.wod.prescription }}</button></div>
        <fieldset v-if="form.record_type === 'exercise'" :disabled="busy"><legend>운동 종류 <span class="required">*</span></legend><div class="selection-chips"><button v-for="category in categories.filter((value) => value !== '크로스핏 와드')" :key="category" type="button" :class="{ selected: form.category === category }" :aria-pressed="form.category === category" @click="form.category = category">{{ category }}</button></div></fieldset>
        <WodFields v-else :wod="form.wod" :busy="busy" />
        <fieldset :disabled="busy"><legend>운동 부위 <span class="required">*</span><small>여러 부위를 선택할 수 있어요</small></legend><div class="selection-chips"><button v-for="part in bodyParts" :key="part" type="button" :class="{ selected: form.body_parts.includes(part) }" :aria-pressed="form.body_parts.includes(part)" @click="togglePart(part)">{{ part }}<span v-if="form.body_parts.includes(part)"> ✓</span></button></div></fieldset>
        <div class="optional-heading">운동 상세 <span>선택 입력</span></div>
        <div class="form-grid">
          <label>운동 시간 (분)<div class="number-stepper"><button type="button" aria-label="운동 시간 감소" :disabled="busy" @click="form.duration = stepNumber(form.duration, -1, 0.1, 1440, 0.1)">−</button><input v-model="form.duration" aria-label="운동 시간 (분)" type="number" inputmode="decimal" min="0.1" max="1440" step="0.1" placeholder="30" :disabled="busy"><button type="button" aria-label="운동 시간 증가" :disabled="busy" @click="form.duration = stepNumber(form.duration, 1, 0.1, 1440, 0.1)">＋</button></div></label>
        </div>
        <fieldset v-if="form.record_type === 'exercise'" class="set-fields" :disabled="busy"><legend>세트별 기록</legend>
          <p class="field-hint">수행한 세트의 중량과 횟수를 입력하세요. 시간만 기록한다면 세트를 추가하지 않아도 됩니다.</p>
          <div v-for="(entry, index) in form.set_entries" :key="index" class="set-row">
            <div class="set-row-heading">
              <strong>{{ index + 1 }}세트</strong>
              <button type="button" class="text-button" :aria-label="`${index + 1}세트 삭제`" @click="form.set_entries.splice(index, 1)">×</button>
            </div>
            <div class="set-inputs">
            <label>중량 (kg)<div class="number-stepper"><button type="button" :aria-label="`${index + 1}세트 중량 감소`" @click="entry.weight = stepNumber(entry.weight, -1, 0, 2000, 2.5)">−</button><input v-model="entry.weight" :aria-label="`${index + 1}세트 중량 (kg)`" type="number" inputmode="decimal" min="0" max="2000" step="0.1" placeholder="선택"><button type="button" :aria-label="`${index + 1}세트 중량 증가`" @click="entry.weight = stepNumber(entry.weight, 1, 0, 2000, 2.5)">＋</button></div></label>
            <label>횟수<div class="number-stepper"><button type="button" :aria-label="`${index + 1}세트 횟수 감소`" @click="entry.reps = stepNumber(entry.reps, -1, 1, 100000)">−</button><input v-model="entry.reps" :aria-label="`${index + 1}세트 횟수`" type="number" inputmode="numeric" min="1" max="100000" step="1" required><button type="button" :aria-label="`${index + 1}세트 횟수 증가`" @click="entry.reps = stepNumber(entry.reps, 1, 1, 100000)">＋</button></div></label>
            </div>
          </div>
          <button type="button" class="button button-outline" :disabled="form.set_entries.length >= 1000" @click="form.set_entries.push({ weight: '', reps: '', completed: true })">＋ 세트 추가</button>
        </fieldset>
        <p v-if="form.record_type === 'wod'" class="field-hint">와드 전체를 한 기록으로 저장해요. 누적 시간에는 직접 입력한 운동 시간만 반영하며, 같은 와드의 동작을 일반 운동으로 중복 저장하지 마세요.</p>
        <label>오늘의 메모<textarea v-model="form.notes" maxlength="1000" rows="3" placeholder="컨디션, 느낀 점, 다음 운동의 목표를 남겨보세요." :disabled="busy"></textarea></label>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p><div class="dialog-actions"><button class="button button-outline" type="button" :disabled="busy" @click="recordDialog.close()">취소</button><button class="button button-dark" type="submit" :disabled="busy">{{ busy ? '저장 중…' : '기록 저장하기 ↗' }}</button></div>
      </form>
    </dialog>

    <dialog ref="authDialog" class="form-dialog auth-dialog" @cancel="busy && $event.preventDefault()"><div class="dialog-heading"><div><p class="eyebrow">WELCOME TO Ggamssi`s-Fit</p><h2>{{ authMode === 'login' ? '다시 만나 반가워요' : '나의 기록 시작하기' }}</h2></div><button class="close-button" :disabled="busy" aria-label="로그인 창 닫기" @click="authDialog.close()">×</button></div><p class="dialog-description">회원가입·로그인 기능은 현재 일시 중단되어 있습니다. 운동 기록은 로그인 없이 공용 DB에 저장되며 모든 접속자에게 공개됩니다.</p><form @submit.prevent="submitAuth"><label>이메일<input ref="emailInput" v-model="credentials.email" type="email" autocomplete="email" required :disabled="busy"></label><label>비밀번호<input v-model="credentials.password" type="password" :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'" :minlength="authMode === 'login' ? 1 : 8" required :disabled="busy" placeholder="가입 시 8자 이상"></label><p v-if="authError" class="form-error" role="alert">{{ authError }}</p><button class="button button-dark full-width" :disabled="busy || !authEnabled">{{ busy ? '처리 중…' : authMode === 'login' ? '로그인' : '회원가입' }}</button><button type="button" class="text-button auth-switch" :disabled="busy" @click="authMode = authMode === 'login' ? 'signup' : 'login'; authError = ''">{{ authMode === 'login' ? '아직 계정이 없나요? 회원가입 →' : '이미 계정이 있나요? 로그인 →' }}</button></form></dialog>
  </div>
</template>
