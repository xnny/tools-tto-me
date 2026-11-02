<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  getRecentTimezones,
  removeRecentTimezone,
  saveRecentTimezone,
  type RecentTimezone,
} from '@/utils/timezoneHistory';

const route = useRoute();
const inputValue = ref('');
const nowSeconds = ref(Math.floor(Date.now() / 1000));
const recentTimezones = ref<RecentTimezone[]>([]);
const historyLoading = ref(true);
const historyError = ref('');
let historyUpdates = Promise.resolve();
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
const formatTimezoneLabel = (hours: number) => {
  if (hours === 0) {
    return 'UTC';
  }
  const sign = hours > 0 ? '+' : '-';
  return `UTC${sign}${Math.abs(hours)}`;
};
const timezoneLabel = computed(() => formatTimezoneLabel(offsetHours.value));

const updateHistory = (action: () => Promise<void>, errorMessage: string) => {
  // Keep saves and deletions in order when the user switches time zones quickly.
  historyUpdates = historyUpdates
    .then(async () => {
      await action();
      recentTimezones.value = await getRecentTimezones();
      historyError.value = '';
    })
    .catch(() => {
      historyError.value = errorMessage;
    })
    .finally(() => {
      historyLoading.value = false;
    });
};

watch(
  offsetHours,
  (offset) => {
    if (route.name === 'TimezoneConverter') {
      updateHistory(
        () => saveRecentTimezone(offset),
        '最近使用的时区暂时无法保存，请稍后再试。',
      );
    }
  },
  { immediate: true },
);

const deleteTimezone = (offset: number) => {
  updateHistory(() => removeRecentTimezone(offset), '时区记录删除失败，请重试。');
};

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
  <main class="timezone-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">TIMESTAMP</p>
        <h1>时间戳转换</h1>
        <p class="subtitle">一行一个：YYYY-MM-DD HH:mm:ss 或 时间戳（秒），时区：{{ timezoneLabel }}</p>
      </div>
    </div>

    <section class="now-card" aria-label="当前时间">
      <div class="now-item">
        <span class="now-label">当前 {{ timezoneLabel }} 时间</span>
        <span class="now-value">{{ currentTime }}</span>
      </div>
      <div class="now-item">
        <span class="now-label">当前时间戳（秒）</span>
        <span class="now-value">{{ nowSeconds }}</span>
      </div>
    </section>

    <section class="converter-card" aria-label="转换">
      <div class="pane">
        <label class="pane-label" for="timezone-input">输入</label>
        <textarea
          id="timezone-input"
          v-model="inputValue"
          rows="12"
          spellcheck="false"
          placeholder="YYYY-MM-DD HH:mm:ss 或 时间戳（秒）"
        ></textarea>
      </div>
      <div class="pane pane-result">
        <label class="pane-label" for="timezone-output">结果</label>
        <textarea id="timezone-output" :value="outputValue" rows="12" readonly></textarea>
      </div>
    </section>

    <section class="recent-timezones" aria-labelledby="recent-timezones-heading">
      <h2 id="recent-timezones-heading">最近使用的时区</h2>
      <p v-if="historyError" class="history-error" role="alert">{{ historyError }}</p>
      <p v-if="historyLoading" class="history-message" role="status">正在加载时区记录…</p>
      <ul v-else-if="recentTimezones.length" class="recent-timezones-list">
        <li
          v-for="timezone in recentTimezones"
          :key="timezone.offsetHours"
          class="recent-timezone-card"
          :class="{ 'is-current': timezone.offsetHours === offsetHours }"
        >
          <RouterLink
            :to="{
              name: 'TimezoneConverter',
              params: { zone: formatTimezoneLabel(timezone.offsetHours).toLowerCase() },
            }"
            class="recent-timezone-link"
          >
            <span class="recent-timezone-label">{{ formatTimezoneLabel(timezone.offsetHours) }}</span>
            <span class="recent-timezone-time">{{
              formatTimeInZone(nowSeconds, timezone.offsetHours)
            }}</span>
          </RouterLink>
          <button
            type="button"
            class="recent-timezone-delete"
            :aria-label="`删除 ${formatTimezoneLabel(timezone.offsetHours)} 时区记录`"
            @click="deleteTimezone(timezone.offsetHours)"
          >
            删除
          </button>
        </li>
      </ul>
      <p v-else-if="!historyError" class="history-message">暂无最近使用的时区。</p>
    </section>
  </main>
</template>

<style scoped>
.timezone-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 58px 24px 72px;
}

.page-heading {
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #3c80d9;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

h1 {
  margin: 0;
  color: var(--color-text);
  font-size: 32px;
  line-height: 1.2;
}

.subtitle {
  margin: 9px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.now-card,
.converter-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.now-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 16px;
}

.now-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 22px;
}

.now-item + .now-item {
  border-left: 1px solid #edf1f6;
}

.now-label {
  color: var(--color-text-muted);
  font-size: 12px;
}

.now-value {
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.converter-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
}

.pane {
  display: flex;
  flex-direction: column;
  padding: 18px 22px 22px;
}

.pane-result {
  background: #f5f9ff;
  border-left: 1px solid #edf1f6;
}

.pane-label {
  margin-bottom: 10px;
  color: var(--color-text-soft);
  font-size: 13px;
  font-weight: 600;
}

textarea {
  width: 100%;
  min-height: 280px;
  padding: 12px 14px;
  color: var(--color-text);
  background: #fff;
  border: 1px solid #dce4ed;
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

textarea::placeholder {
  color: #b4bdc8;
}

textarea:focus {
  border-color: #4b94e9;
  outline: none;
  box-shadow: 0 0 0 3px rgba(75, 148, 233, 0.15);
}

textarea[readonly] {
  color: #2c4a75;
  background: #fbfdff;
}

.recent-timezones {
  margin-top: 32px;
}

.recent-timezones h2 {
  margin: 0 0 14px;
  font-size: 18px;
  font-weight: 600;
}

.recent-timezones-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent-timezone-card {
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  transition: border-color 0.15s;
}

.recent-timezone-card:hover,
.recent-timezone-card.is-current {
  border-color: #9fc1f0;
}

.recent-timezone-card.is-current {
  background: var(--color-primary-soft);
}

.recent-timezone-link {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: var(--radius);
}

.recent-timezone-label {
  padding-right: 48px;
  color: var(--color-primary);
  font-weight: 600;
}

.recent-timezone-time {
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.recent-timezone-delete {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 5px 8px;
  color: var(--color-text-soft);
  background: transparent;
  border: 0;
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.15s,
    visibility 0.15s,
    color 0.15s,
    background-color 0.15s;
}

.recent-timezone-card:hover .recent-timezone-delete,
.recent-timezone-delete:focus-visible {
  opacity: 1;
  visibility: visible;
}

.recent-timezone-delete:hover {
  color: #b42318;
  background: #fff0ee;
}

.history-message,
.history-error {
  margin: 12px 0;
  color: var(--color-text-soft);
  font-size: 14px;
}

.history-error {
  color: #b42318;
}

@media (max-width: 700px) {
  .timezone-page {
    padding: 30px 12px 48px;
  }

  .now-card,
  .converter-card {
    grid-template-columns: 1fr;
  }

  .now-item + .now-item,
  .pane-result {
    border-top: 1px solid #edf1f6;
    border-left: 0;
  }

  .now-value {
    font-size: 18px;
  }

  .pane {
    padding: 14px;
  }

  textarea {
    min-height: 200px;
  }
}
</style>
