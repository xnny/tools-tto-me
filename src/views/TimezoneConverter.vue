<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const inputValue = ref('');
const nowSeconds = ref(Math.floor(Date.now() / 1000));
let timer: number | undefined;

const resolveOffsetHours = (zone?: string) => {
  if (!zone) {
    return 0;
  }
  const match = zone.toLowerCase().match(/^utc([+-]\d{1,2})$/);
  if (!match) {
    return 0;
  }
  const offset = Number(match[1]);
  return Number.isFinite(offset) ? offset : 0;
};

const offsetHours = computed(() => resolveOffsetHours(route.params.zone as string | undefined));
const timezoneLabel = computed(() => {
  const hours = offsetHours.value;
  if (hours === 0) {
    return 'UTC';
  }
  const sign = hours > 0 ? '+' : '-';
  return `UTC${sign}${Math.abs(hours)}`;
});

const parseTimestampInZone = (value: string, offset: number) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const baseDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    baseDate.getUTCFullYear() !== year ||
    baseDate.getUTCMonth() + 1 !== month ||
    baseDate.getUTCDate() !== day ||
    baseDate.getUTCHours() !== hour ||
    baseDate.getUTCMinutes() !== minute ||
    baseDate.getUTCSeconds() !== second
  ) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day, hour - offset, minute, second);
  return Math.floor(utcMs / 1000);
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const formatTimeInZone = (timestampSeconds: number, offset: number) => {
  if (!Number.isFinite(timestampSeconds)) {
    return null;
  }
  const date = new Date(timestampSeconds * 1000 + offset * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const minute = pad2(date.getUTCMinutes());
  const second = pad2(date.getUTCSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const outputValue = computed(() => {
  if (!inputValue.value) {
    return '';
  }
  const lines = inputValue.value.split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return '';
      }
      const offset = offsetHours.value;
      if (/^-?\d+$/.test(trimmed)) {
        const rawValue = Number(trimmed);
        if (!Number.isFinite(rawValue)) {
          return 'NaN';
        }
        return formatTimeInZone(rawValue, offset) ?? 'NaN';
      }
      const result = parseTimestampInZone(trimmed, offset);
      return result === null ? 'NaN' : String(result);
    })
    .join('\n');
});

const currentTime = computed(() => formatTimeInZone(nowSeconds.value, offsetHours.value) ?? 'NaN');

onMounted(() => {
  timer = window.setInterval(() => {
    nowSeconds.value = Math.floor(Date.now() / 1000);
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer);
  }
});
</script>

<template>
  <div class="timezone-page">
    <h1 class="timezone-now">当前{{ timezoneLabel }}时间：{{ currentTime }}</h1>
    <p class="timezone-hint">
      一行一个：YYYY-MM-DD HH:mm:ss 或 时间戳（秒），时区：{{ timezoneLabel }}
    </p>
    <div class="timezone-layout">
      <div class="timezone-form">
        <div class="label">Input:</div>
        <el-input
          v-model="inputValue"
          type="textarea"
          :autosize="{ minRows: 12, maxRows: 50 }"
          placeholder="YYYY-MM-DD HH:mm:ss 或 时间戳（秒）"
          clearable
        />
      </div>
      <div class="timezone-result">
        <div class="label">Result:</div>
        <el-input
          :model-value="outputValue"
          type="textarea"
          :autosize="{ minRows: 12, maxRows: 50 }"
          readonly
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.timezone-page {
  padding: 32px 20px;
  max-width: 960px;
  margin: 0 auto;

  h1 {
    margin-bottom: 12px;
    text-align: center;
  }
}

.timezone-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.timezone-form,
.timezone-result {
  flex: 1 1 320px;
  min-width: 280px;
  max-width: 520px;
}

.timezone-result {
  font-weight: 600;
}

.timezone-hint {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: center;
}

.timezone-now {
  margin-bottom: 16px;
  font-weight: 600;
  text-align: center;
}

.label {
  margin-bottom: 8px;
}

@media (max-width: 768px) {
  .timezone-page {
    padding: 20px 16px;
  }

  .timezone-layout {
    gap: 12px;
  }
}
</style>
