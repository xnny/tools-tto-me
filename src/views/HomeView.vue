<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { tools } from '@/tools'
</script>

<template>
  <main class="home-page">
    <section class="hero">
      <h1>简单好用的在线小工具</h1>
      <p class="subtitle">无需安装、即开即用，所有计算均在浏览器本地完成。</p>
    </section>

    <section class="tool-grid" aria-label="工具列表">
      <RouterLink
        v-for="tool in tools"
        :key="tool.name"
        :to="tool.path"
        class="tool-card"
        :style="{ '--tool-color': tool.color }"
      >
        <span class="tool-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="tool.icon" />
          </svg>
        </span>
        <span class="tool-body">
          <span class="tool-title">{{ tool.title }}</span>
          <span class="tool-desc">{{ tool.description }}</span>
        </span>
        <span class="tool-arrow" aria-hidden="true">→</span>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 72px 24px 48px;
}

.hero {
  margin-bottom: 40px;
}

h1 {
  margin: 0;
  color: var(--color-text);
  font-size: 34px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.subtitle {
  margin: 12px 0 0;
  color: var(--color-text-muted);
  font-size: 15px;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.tool-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 22px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    border-color 0.2s;
}

.tool-card:hover {
  border-color: color-mix(in srgb, var(--tool-color) 35%, var(--color-border));
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.tool-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: var(--tool-color);
  background: color-mix(in srgb, var(--tool-color) 12%, #fff);
  border-radius: 11px;
}

.tool-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tool-title {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
}

.tool-desc {
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.tool-arrow {
  align-self: center;
  color: #c3ccd7;
  font-size: 18px;
  transition:
    color 0.2s,
    transform 0.2s;
}

.tool-card:hover .tool-arrow {
  color: var(--tool-color);
  transform: translateX(3px);
}

@media (max-width: 700px) {
  .home-page {
    padding: 40px 16px 32px;
  }

  h1 {
    font-size: 26px;
  }
}
</style>
