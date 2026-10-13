<script setup>
import { computed } from 'vue'
import { stepNumber } from '../lib/workouts.js'
import { createWodTeam, teamRules } from '../lib/wod.js'

const props = defineProps({
  wod: { type: Object, required: true },
  team: { type: Object, required: true },
  busy: { type: Boolean, default: false },
})

const types = ['AMRAP', 'EMOM', 'FOR TIME', '기타']
const scalings = ['Rx', 'Scaled']
const statuses = computed(() =>
  props.wod.type === 'EMOM'
    ? [
        { value: 'completed', label: '전체 달성' },
        { value: 'partial', label: '일부 미달' },
        { value: 'stopped', label: '중도 종료' },
      ]
    : [
        { value: 'completed', label: '완주' },
        { value: 'time_cap', label: '타임캡 도달' },
        { value: 'stopped', label: '중도 종료' },
      ],
)

function changeMode(mode) {
  if (props.busy || props.team.wod_mode === mode) return
  Object.assign(props.team, createWodTeam(), mode === 'team' ? { wod_mode: 'team', team_size: 2 } : {})
}

function toggleRule(rule) {
  if (props.busy) return
  props.team.team_rules = props.team.team_rules.includes(rule)
    ? props.team.team_rules.filter((value) => value !== rule) : [...props.team.team_rules, rule]
}

function changeType(newType) {
  if (props.busy || props.wod.type === newType) return

  Object.assign(props.wod, {
    type: newType,
    status: 'completed',
    rounds: '',
    extra_reps: '',
    progress: '',
    intervals_completed: '',
    shortfalls: '',
    finish_minutes: '',
    finish_seconds: '',
    result: '',
    time_limit: '',
    total_minutes: '',
    target_rounds: '',
    time_cap: '',
  })
}
</script>

<template>
  <div class="wod-fields">
    <fieldset :disabled="busy">
      <legend>참여 방식</legend>
      <div class="selection-chips" role="group" aria-label="참여 방식">
        <button type="button" :class="{ selected: team.wod_mode === 'individual' }" :aria-pressed="team.wod_mode === 'individual'" @click="changeMode('individual')">개인전</button>
        <button type="button" :class="{ selected: team.wod_mode === 'team' }" :aria-pressed="team.wod_mode === 'team'" @click="changeMode('team')">팀 와드</button>
      </div>
      <template v-if="team.wod_mode === 'team'">
        <label>팀 규모 (본인 포함)
          <select v-model.number="team.team_size">
            <option v-for="size in 19" :key="size" :value="size + 1">{{ size + 1 }}인 1조</option>
          </select>
        </label>
        <label>팀원 / 파트너 (선택)
          <input v-model="team.team_partners" maxlength="500" placeholder="예: 잼민이, 운동친구" aria-describedby="team-partners-hint" />
        </label>
        <p id="team-partners-hint" class="field-hint">함께한 파트너의 닉네임을 자유롭게 적어주세요. 공용 기록에 공개되므로 실명·연락처는 피해주세요. 사용자 계정 태그 기능은 제공하지 않습니다.</p>
      </template>
    </fieldset>
    <fieldset :disabled="busy">
      <legend>와드 방식</legend>
      <div class="selection-chips">
        <button
          v-for="type in types"
          :key="type"
          type="button"
          :class="{ selected: wod.type === type }"
          :aria-pressed="wod.type === type"
          @click="changeType(type)"
        >
          {{ type }}
        </button>
      </div>
    </fieldset>

    <fieldset :disabled="busy">
      <legend>와드 구성</legend>
      <label>
        운동 구성 (필수)
        <textarea
          v-model="wod.prescription"
          required
          maxlength="3000"
          rows="4"
          placeholder="예: 10회 스러스터 43kg / 95lb + 200m 달리기"
        ></textarea>
      </label>
      <p class="field-hint">원래 정해진 동작·횟수·중량·거리를 적어주세요. 중량은 kg 또는 lb 단위를 함께 표시해주세요.</p>
      <fieldset v-if="team.wod_mode === 'team'" :disabled="busy">
        <legend>팀 수행 규칙 <small>복수 선택 가능</small></legend>
        <div class="selection-chips" role="group" aria-label="팀 수행 규칙">
          <button v-for="rule in teamRules" :key="rule.value" type="button" :class="{ selected: team.team_rules.includes(rule.value) }" :aria-pressed="team.team_rules.includes(rule.value)" @click="toggleRule(rule.value)">{{ rule.label }}</button>
        </div>
        <p class="field-hint">동작별 규칙이 다르면 함께 선택하고, 분배·교대 조건은 운동 구성에 적어주세요.</p>
      </fieldset>
    </fieldset>

    <fieldset :disabled="busy">
      <legend>수행 기준</legend>
      <div class="selection-chips" role="group" aria-label="수행 기준">
        <button
          v-for="scaling in scalings"
          :key="scaling"
          type="button"
          :class="{ selected: wod.scaling === scaling }"
          :aria-pressed="wod.scaling === scaling"
          @click="wod.scaling = scaling"
        >
          {{ scaling }}
        </button>
      </div>
      <p class="field-hint">Rx: 정해진 구성 그대로 수행 · Scaled: 동작·중량·횟수 등을 조정해 수행</p>
      <label v-if="wod.scaling === 'Scaled'">
        실제 변경 내용 (필수)
        <textarea
          v-model="wod.modifications"
          required
          maxlength="3000"
          rows="3"
          placeholder="예: 스러스터 95lb → 65lb, 풀업 → 링로우"
        ></textarea>
      </label>
    </fieldset>

    <fieldset v-if="wod.type !== '기타'" :disabled="busy">
      <legend>와드 설정</legend>
      <div class="form-grid">
        <label v-if="wod.type === 'AMRAP'">
          제한 시간 (분, 필수)
          <div class="number-stepper">
            <button type="button" aria-label="제한 시간 (분, 필수) 감소" @click="wod.time_limit = stepNumber(wod.time_limit, -1, 0.1, 1440, 0.1)">−</button>
            <input v-model.number="wod.time_limit" aria-label="제한 시간 (분, 필수)" type="number" inputmode="decimal" min="0.1" max="1440" step="0.1" required />
            <button type="button" aria-label="제한 시간 (분, 필수) 증가" @click="wod.time_limit = stepNumber(wod.time_limit, 1, 0.1, 1440, 0.1)">+</button>
          </div>
        </label>
        <label v-if="wod.type === 'EMOM'">
          총 시간 / 구간 수 (필수)
          <div class="number-stepper">
            <button type="button" aria-label="총 시간 / 구간 수 (필수) 감소" @click="wod.total_minutes = stepNumber(wod.total_minutes, -1, 1, 1440)">−</button>
            <input v-model.number="wod.total_minutes" aria-label="총 시간 / 구간 수 (필수)" type="number" inputmode="numeric" min="1" max="1440" step="1" required />
            <button type="button" aria-label="총 시간 / 구간 수 (필수) 증가" @click="wod.total_minutes = stepNumber(wod.total_minutes, 1, 1, 1440)">+</button>
          </div>
        </label>
        <template v-if="wod.type === 'FOR TIME'">
          <label>
            목표 라운드 (선택)
            <div class="number-stepper">
              <button type="button" aria-label="목표 라운드 (선택) 감소" @click="wod.target_rounds = stepNumber(wod.target_rounds, -1, 1, 1000)">−</button>
              <input v-model.number="wod.target_rounds" aria-label="목표 라운드 (선택)" type="number" inputmode="numeric" min="1" max="1000" step="1" />
              <button type="button" aria-label="목표 라운드 (선택) 증가" @click="wod.target_rounds = stepNumber(wod.target_rounds, 1, 1, 1000)">+</button>
            </div>
          </label>
          <label>
            타임캡 (분, 선택)
            <div class="number-stepper">
              <button type="button" aria-label="타임캡 (분, 선택) 감소" @click="wod.time_cap = stepNumber(wod.time_cap, -1, 0.1, 1440, 0.1)">−</button>
              <input v-model.number="wod.time_cap" aria-label="타임캡 (분, 선택)" type="number" inputmode="decimal" min="0.1" max="1440" step="0.1" :required="wod.status === 'time_cap'" />
              <button type="button" aria-label="타임캡 (분, 선택) 증가" @click="wod.time_cap = stepNumber(wod.time_cap, 1, 0.1, 1440, 0.1)">+</button>
            </div>
          </label>
        </template>
      </div>
    </fieldset>

    <fieldset :disabled="busy">
      <legend>수행 결과 · {{ wod.type }}</legend>
      <p v-if="team.wod_mode === 'team'" class="field-hint team-result-guide" role="note">팀 전체 라운드/시간/수행 결과를 입력하세요. 개인별 기록이 아닌 팀의 총 기록으로 저장합니다.</p>
      <div
        v-if="wod.type === 'EMOM' || wod.type === 'FOR TIME'"
        class="selection-chips"
        role="group"
        aria-label="수행 상태"
      >
        <button
          v-for="status in statuses"
          :key="status.value"
          type="button"
          :class="{ selected: wod.status === status.value }"
          :aria-pressed="wod.status === status.value"
          @click="wod.status = status.value"
        >
          {{ status.label }}
        </button>
      </div>

      <template v-if="wod.type === 'AMRAP' || (wod.type === 'FOR TIME' && wod.status !== 'completed')">
        <div class="form-grid">
          <label>
            완료 라운드 (필수)
            <div class="number-stepper">
              <button type="button" aria-label="완료 라운드 (필수) 감소" @click="wod.rounds = stepNumber(wod.rounds, -1, 0, 1000)">−</button>
              <input v-model.number="wod.rounds" aria-label="완료 라운드 (필수)" type="number" inputmode="numeric" min="0" max="1000" step="1" required />
              <button type="button" aria-label="완료 라운드 (필수) 증가" @click="wod.rounds = stepNumber(wod.rounds, 1, 0, 1000)">+</button>
            </div>
          </label>
          <label>
            추가 반복 수 (필수)
            <div class="number-stepper">
              <button type="button" aria-label="추가 반복 수 (필수) 감소" @click="wod.extra_reps = stepNumber(wod.extra_reps, -1, 0, 100000)">−</button>
              <input v-model.number="wod.extra_reps" aria-label="추가 반복 수 (필수)" type="number" inputmode="numeric" min="0" max="100000" step="1" required />
              <button type="button" aria-label="추가 반복 수 (필수) 증가" @click="wod.extra_reps = stepNumber(wod.extra_reps, 1, 0, 100000)">+</button>
            </div>
          </label>
        </div>
        <p v-if="wod.type === 'AMRAP'" class="record-notes">
          추가 반복 수는 완료 라운드 이후 마지막 미완료 라운드에서 수행한 반복 수입니다. 추가 반복이 없으면 0을 입력하세요.
        </p>
        <label>
          마지막 진행량 (선택)
          <textarea
            v-model="wod.progress"
            maxlength="1000"
            rows="2"
            placeholder="예: 마지막 달리기 120m, 로잉 8칼로리"
          ></textarea>
        </label>
      </template>

      <template v-if="wod.type === 'EMOM'">
        <p class="record-notes">
          EMOM은 단순히 참여한 구간 수가 아니라 각 구간의 처방 목표 달성 여부가 중요합니다.
        </p>
        <label>
          목표를 달성한 구간 수 (필수)
          <div class="number-stepper">
            <button type="button" aria-label="목표를 달성한 구간 수 (필수) 감소" @click="wod.intervals_completed = stepNumber(wod.intervals_completed, -1, 0, Number(wod.total_minutes) || 1440)">−</button>
            <input v-model.number="wod.intervals_completed" aria-label="목표를 달성한 구간 수 (필수)" type="number" inputmode="numeric" min="0" max="1440" step="1" required />
            <button type="button" aria-label="목표를 달성한 구간 수 (필수) 증가" @click="wod.intervals_completed = stepNumber(wod.intervals_completed, 1, 0, Number(wod.total_minutes) || 1440)">+</button>
          </div>
        </label>
        <label v-if="wod.status === 'partial' || wod.status === 'stopped'">
          미달 / 중도 종료 내용 (필수)
          <textarea
            v-model="wod.shortfalls"
            required
            maxlength="1000"
            rows="3"
            placeholder="목표에 미달한 구간과 실제 수행량 또는 종료 지점을 적어 주세요."
          ></textarea>
        </label>
      </template>

      <template v-if="wod.type === 'FOR TIME'">
        <p class="record-notes">
          처방을 모두 마친 경우에만 완주 시간을 기록하세요. 타임캡 도달 또는 중도 종료 시 경과 시간을 완주 시간으로 기록하지 않습니다.
        </p>
        <div v-if="wod.status === 'completed'" class="form-grid">
          <label>
            완주 시간 (분, 필수)
            <div class="number-stepper">
              <button type="button" aria-label="완주 시간 (분, 필수) 감소" @click="wod.finish_minutes = stepNumber(wod.finish_minutes, -1, 0, 1440)">−</button>
              <input v-model.number="wod.finish_minutes" aria-label="완주 시간 (분, 필수)" type="number" inputmode="numeric" min="0" max="1440" step="1" required />
              <button type="button" aria-label="완주 시간 (분, 필수) 증가" @click="wod.finish_minutes = stepNumber(wod.finish_minutes, 1, 0, 1440)">+</button>
            </div>
          </label>
          <label>
            완주 시간 (초, 필수)
            <div class="number-stepper">
              <button type="button" aria-label="완주 시간 (초, 필수) 감소" @click="wod.finish_seconds = stepNumber(wod.finish_seconds, -1, 0, 59)">−</button>
              <input v-model.number="wod.finish_seconds" aria-label="완주 시간 (초, 필수)" type="number" inputmode="numeric" min="0" max="59" step="1" required />
              <button type="button" aria-label="완주 시간 (초, 필수) 증가" @click="wod.finish_seconds = stepNumber(wod.finish_seconds, 1, 0, 59)">+</button>
            </div>
          </label>
        </div>
      </template>

      <label v-if="wod.type === '기타'">
        결과 (필수)
        <textarea v-model="wod.result" required maxlength="1000" rows="3"></textarea>
      </label>
    </fieldset>
  </div>
</template>