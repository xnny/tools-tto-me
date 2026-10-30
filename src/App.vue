<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import logoUrl from '@/assets/logo.svg'
import { tools } from '@/tools'

const year = new Date().getFullYear()
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <div class="header-inner">
        <RouterLink to="/" class="brand" aria-label="TTO Tools 首页">
          <img :src="logoUrl" alt="" width="30" height="30" class="brand-logo" />
          <span class="brand-name">TTO Tools</span>
        </RouterLink>
        <nav class="site-nav" aria-label="工具导航">
          <RouterLink v-for="tool in tools" :key="tool.name" :to="tool.path" class="nav-link">
            {{ tool.title }}
          </RouterLink>
        </nav>
      </div>
    </header>

    <div class="site-main">
      <RouterView />
    </div>

    <footer class="site-footer">© {{ year }} tools.tto.me</footer>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1000px;
  height: 60px;
  margin: 0 auto;
  padding: 0 24px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-logo {
  display: block;
}

.brand-name {
  color: var(--color-text);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.site-nav {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.nav-link {
  padding: 6px 12px;
  color: var(--color-text-soft);
  font-size: 14px;
  white-space: nowrap;
  border-radius: 8px;
  transition:
    color 0.15s,
    background-color 0.15s;
}

.nav-link:hover {
  color: var(--color-text);
  background: #f1f4f8;
}

.nav-link.router-link-active {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-weight: 500;
}

.site-main {
  flex: 1;
}

.site-footer {
  padding: 24px;
  color: #a7b1bd;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 520px) {
  .header-inner {
    padding: 0 14px;
  }

  .brand-name {
    display: none;
  }
}
</style>
