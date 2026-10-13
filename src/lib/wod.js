export const wodTypes = ['AMRAP', 'EMOM', 'FOR TIME', '기타']

export function createWod() {
  return {
    type: 'AMRAP', prescription: '', scaling: 'Rx', modifications: '',
    time_limit: '', total_minutes: '', target_rounds: '', time_cap: '',
    rounds: '', extra_reps: '', progress: '', intervals_completed: '', shortfalls: '',
    status: 'completed', finish_minutes: '', finish_seconds: '', result: '',
  }
}

function hasNumber(value, min, max, integer = true) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return false
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number))
}

function hasText(value, max, required = false) {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0)
}

export function validateWod(wod) {
  if (!wod || !wodTypes.includes(wod.type)) return '와드 진행 방식을 선택해주세요.'
  if (!hasText(wod.prescription, 3000, true)) return '처방 구성은 1~3,000자로 입력해주세요.'
  if (!['Rx', 'Scaled'].includes(wod.scaling)) return '수행 기준을 선택해주세요.'
  if (!hasText(wod.modifications, 3000, wod.scaling === 'Scaled')) return '실제 변경 내용을 3,000자 이내로 입력해주세요.'
  if (wod.type === 'AMRAP') {
    if (!hasNumber(wod.time_limit, 0.1, 1440, false)) return '제한 시간은 0.1~1,440분으로 입력해주세요.'
  }
  if (wod.type === 'EMOM') {
    if (!hasNumber(wod.total_minutes, 1, 1440)) return 'EMOM 총 시간은 1~1,440분의 정수로 입력해주세요.'
    if (!['completed', 'partial', 'stopped'].includes(wod.status)) return 'EMOM 수행 상태를 선택해주세요.'
    if (!hasNumber(wod.intervals_completed, 0, Number(wod.total_minutes))) return '목표 달성 구간 수는 총 구간 수 이하의 정수로 입력해주세요.'
    if ((wod.status === 'completed') !== (Number(wod.intervals_completed) === Number(wod.total_minutes))) return '수행 상태와 목표 달성 구간 수를 확인해주세요.'
    if (!hasText(wod.shortfalls, 1000, wod.status !== 'completed')) return '미달 또는 중단 내용을 1,000자 이내로 입력해주세요.'
  }
  if (wod.type === 'FOR TIME') {
    for (const [key, label, min, max, integer] of [['target_rounds', '목표 라운드', 1, 1000, true], ['time_cap', '타임캡', 0.1, 1440, false]]) {
      if (wod[key] !== '' && wod[key] !== null && wod[key] !== undefined && !hasNumber(wod[key], min, max, integer)) return `${label} 입력을 확인해주세요.`
    }
    if (!['completed', 'time_cap', 'stopped'].includes(wod.status)) return '완주 여부를 선택해주세요.'
    if (wod.status === 'time_cap' && !hasNumber(wod.time_cap, 0.1, 1440, false)) return '타임캡 도달 기록에는 타임캡을 입력해주세요.'
    if (wod.status === 'completed') {
      if (!hasNumber(wod.finish_minutes, 0, 1440) || !hasNumber(wod.finish_seconds, 0, 59)) return '완주 시간은 분과 초(0~59)의 정수로 입력해주세요.'
      const seconds = Number(wod.finish_minutes) * 60 + Number(wod.finish_seconds)
      if (seconds <= 0 || seconds > 86400) return '완주 시간은 0초보다 크고 24시간 이하여야 합니다.'
      if (wod.time_cap !== '' && wod.time_cap != null && seconds > Number(wod.time_cap) * 60) return '완주 시간이 타임캡을 초과했습니다. 미완료 상태로 기록해주세요.'
    }
  }
  if (wod.type === 'AMRAP' || (wod.type === 'FOR TIME' && wod.status !== 'completed')) {
    if (!hasNumber(wod.rounds, 0, 1000) || !hasNumber(wod.extra_reps, 0, 100000)) return '완료 라운드와 추가 반복 수는 0 이상의 정수로 입력해주세요.'
    if (!hasText(wod.progress, 1000)) return '마지막 진행량은 1,000자 이내로 입력해주세요.'
    if (wod.type === 'FOR TIME' && wod.target_rounds !== '' && wod.target_rounds != null && Number(wod.rounds) >= Number(wod.target_rounds)) return '미완료 라운드는 목표 라운드보다 작아야 합니다.'
  }
  if (wod.type === '기타' && !hasText(wod.result, 1000, true)) return '수행 결과를 1~1,000자로 입력해주세요.'
  return ''
}

export function normalizeWod(wod) {
  const result = { type: wod.type, prescription: wod.prescription.trim(), scaling: wod.scaling, modifications: wod.scaling === 'Scaled' ? wod.modifications.trim() : '' }
  const keys = wod.type === 'AMRAP' ? ['time_limit', 'rounds', 'extra_reps']
    : wod.type === 'EMOM' ? ['total_minutes', 'intervals_completed']
      : wod.type === 'FOR TIME' ? ['target_rounds', 'time_cap', ...(wod.status === 'completed' ? ['finish_minutes', 'finish_seconds'] : ['rounds', 'extra_reps'])] : []
  for (const key of keys) result[key] = wod[key] === '' || wod[key] == null ? null : Number(wod[key])
  if (wod.type === 'EMOM' || wod.type === 'FOR TIME') result.status = wod.status
  if (wod.type === 'AMRAP' || (wod.type === 'FOR TIME' && wod.status !== 'completed')) result.progress = wod.progress.trim()
  if (wod.type === 'EMOM') result.shortfalls = wod.status === 'completed' ? '' : wod.shortfalls.trim()
  if (wod.type === '기타') result.result = wod.result.trim()
  return result
}