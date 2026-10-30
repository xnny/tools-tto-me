<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="not-found-page">
    <section class="not-found-card">
      <p class="error-code">404</p>
      <h1>页面未找到</h1>
      <p class="description">您访问的页面不存在，请检查地址或返回首页。</p>
      <RouterLink to="/" class="home-link">返回首页</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.not-found-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 72px 24px 48px;
}

.not-found-card {
  padding: 56px 24px;
  text-align: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.error-code {
  margin: 0 0 8px;
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
}

h1 {
  margin: 0;
  font-size: 26px;
}

.description {
  margin: 10px 0 24px;
  color: var(--color-text-muted);
}

.home-link {
  display: inline-block;
  padding: 9px 18px;
  color: #fff;
  background: var(--color-primary);
  border-radius: 8px;
  font-weight: 500;
}

.home-link:hover {
  background: #245cc1;
}

@media (max-width: 700px) {
  .not-found-page {
    padding: 40px 16px 32px;
  }
}
</style>
