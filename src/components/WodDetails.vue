<script setup>
import { computed } from 'vue'
import { teamRules } from '../lib/wod.js'

const props = defineProps({
  wod: { type: Object, required: true },
  team: { type: Object, default: () => ({}) },
})

const statusLabel = computed(() => {
  const labels = props.wod.type === 'EMOM'
    ? { completed: '전체 달성', partial: '일부 미달', stopped: '중도 종료' }
    : { completed: '완주', time_cap: '타임캡 도달', stopped: '중도 종료' }

  return labels[props.wod.status] || ''
})

const resultText = computed(() => {
  const wod = props.wod

  if (wod.type === 'AMRAP') return `${wod.rounds}라운드 + ${wod.extra_reps}회`
  if (wod.type === 'EMOM') return `${wod.total_minutes}개 구간 중 ${wod.intervals_completed}개 목표 달성`
  if (wod.type === 'FOR TIME') {
    return wod.status === 'completed'
      ? `${wod.finish_minutes}분 ${wod.finish_seconds}초 완주`
      : `${statusLabel.value} · ${wod.rounds}라운드 + ${wod.extra_reps}회`
  }

  return wod.result
})
</script>

<template>
  <div class="wod-details">
    <p class="category-label">{{ wod.type }} · {{ wod.scaling }}</p>
    <p class="category-label">{{ team.wod_mode === 'team' ? `팀 와드 · ${team.team_size}인 1조` : '개인전' }}</p>
    <template v-if="team.wod_mode === 'team'">
      <p v-if="team.team_partners" class="record-notes">파트너: {{ team.team_partners }}</p>
      <div class="part-tags" aria-label="팀 수행 규칙">
        <template v-for="rule in teamRules" :key="rule.value"><span v-if="team.team_rules?.includes(rule.value)">{{ rule.label }}</span></template>
      </div>
    </template>

    <div class="record-metrics">
      <p v-if="wod.type === 'AMRAP'">제한 시간: {{ wod.time_limit }}분</p>
      <template v-if="wod.type === 'EMOM'">
        <p>총 시간 / 구간 수: {{ wod.total_minutes }}</p>
        <p>수행 상태: {{ statusLabel }}</p>
      </template>
      <template v-if="wod.type === 'FOR TIME'">
        <p v-if="wod.target_rounds != null && wod.target_rounds !== ''">
          목표: {{ wod.target_rounds }}라운드
        </p>
        <p v-if="wod.time_cap != null && wod.time_cap !== ''">
          타임캡: {{ wod.time_cap }}분
        </p>
      </template>
    </div>

    <p class="category-label">{{ team.wod_mode === 'team' ? '팀 전체 결과' : '결과' }}</p>
    <p class="record-notes">{{ resultText }}</p>

    <template v-if="wod.progress && (wod.type === 'AMRAP' || (wod.type === 'FOR TIME' && wod.status !== 'completed'))">
      <p class="category-label">마지막 진행량</p>
      <p class="record-notes">{{ wod.progress }}</p>
    </template>

    <template v-if="wod.type === 'EMOM' && wod.status !== 'completed' && wod.shortfalls">
      <p class="category-label">미달 / 중도 종료 내용</p>
      <p class="record-notes">{{ wod.shortfalls }}</p>
    </template>

    <p class="category-label">운동 구성</p>
    <p class="record-notes">{{ wod.prescription }}</p>

    <template v-if="wod.scaling === 'Scaled'">
      <p class="category-label">Scaled 실제 변경 내용</p>
      <p class="record-notes">{{ wod.modifications }}</p>
    </template>
  </div>
</template>

<style scoped>
.record-notes {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>