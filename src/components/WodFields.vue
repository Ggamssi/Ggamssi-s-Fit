<script setup>
import { computed } from 'vue'

const props = defineProps({
  wod: { type: Object, required: true },
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
      <legend>처방과 수행 기준</legend>
      <label>
        처방 구성 (필수)
        <textarea
          v-model="wod.prescription"
          required
          maxlength="3000"
          rows="4"
          placeholder="예: 10회 스러스터 43kg / 95lb + 200m 달리기"
        ></textarea>
      </label>
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
      <label v-if="wod.scaling === 'Scaled'">
        실제 변경 내용 (필수)
        <textarea
          v-model="wod.modifications"
          required
          maxlength="3000"
          rows="3"
          placeholder="실제로 수행한 동작, 반복 수, 무게 또는 거리 변경을 적어 주세요."
        ></textarea>
      </label>
    </fieldset>

    <fieldset v-if="wod.type !== '기타'" :disabled="busy">
      <legend>와드 설정</legend>
      <div class="form-grid">
        <label v-if="wod.type === 'AMRAP'">
          제한 시간 (분, 필수)
          <input v-model.number="wod.time_limit" type="number" min="0.1" max="1440" step="0.1" required />
        </label>
        <label v-if="wod.type === 'EMOM'">
          총 시간 / 구간 수 (필수)
          <input v-model.number="wod.total_minutes" type="number" min="1" max="1440" step="1" required />
        </label>
        <template v-if="wod.type === 'FOR TIME'">
          <label>
            목표 라운드 (선택)
            <input v-model.number="wod.target_rounds" type="number" min="1" max="1000" step="1" />
          </label>
          <label>
            타임캡 (분, 선택)
            <input v-model.number="wod.time_cap" type="number" min="0.1" max="1440" step="0.1" :required="wod.status === 'time_cap'" />
          </label>
        </template>
      </div>
    </fieldset>

    <fieldset :disabled="busy">
      <legend>수행 결과</legend>
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
            <input v-model.number="wod.rounds" type="number" min="0" max="1000" step="1" required />
          </label>
          <label>
            추가 반복 수 (필수)
            <input v-model.number="wod.extra_reps" type="number" min="0" max="100000" step="1" required />
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
          <input v-model.number="wod.intervals_completed" type="number" min="0" max="1440" step="1" required />
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
            <input v-model.number="wod.finish_minutes" type="number" min="0" max="1440" step="1" required />
          </label>
          <label>
            완주 시간 (초, 필수)
            <input v-model.number="wod.finish_seconds" type="number" min="0" max="59" step="1" required />
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