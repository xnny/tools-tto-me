<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="guide-page">
    <header class="guide-header">
      <h1>使用说明</h1>
      <p>了解各个工具的使用方法，以及数据在浏览器中的保存方式。</p>
    </header>

    <section class="guide-section" aria-labelledby="data-heading">
      <h2 id="data-heading">数据与隐私</h2>
      <p>
        工具在浏览器本地运行。待办、草稿、最近使用的时区和两步验证密钥保存在当前浏览器中，不会上传到服务器。
        这些数据不会自动同步到其他浏览器或设备；清除浏览器数据可能会将其删除。请确保浏览器允许本地存储。
      </p>
      <p class="notice">
        两步验证密钥在浏览器中未加密保存。导出的 JSON
        文件也包含明文密钥，请妥善保管，并保留其他登录或恢复方式。
      </p>
    </section>

    <section class="guide-section" aria-labelledby="calendar-heading">
      <div class="section-heading">
        <h2 id="calendar-heading">日历</h2>
        <RouterLink to="/calendar">打开日历 →</RouterLink>
      </div>
      <p>
        查看公历、农历、节气、节日、每日宜忌和日期详情，支持切换年月、节日以及返回今天。可查看的年份为
        1901 至 2099 年。基督教节日按西方教会常用公历日期标注；节假日及调休安排以官方公布为准。
      </p>
    </section>

    <section class="guide-section" aria-labelledby="timezone-heading">
      <div class="section-heading">
        <h2 id="timezone-heading">时间戳转换</h2>
        <RouterLink to="/timezone">打开时间戳转换 →</RouterLink>
      </div>
      <ul>
        <li>
          每行输入一个日期时间（<code>YYYY-MM-DD HH:mm:ss</code>）或秒级时间戳，可混合批量转换。
        </li>
        <li>选择 UTC 固定整点偏移时区后进行转换；无效输入会显示为 <code>NaN</code>。</li>
        <li>最近使用的时区保存在当前浏览器中，方便下次选择。</li>
      </ul>
    </section>

    <section class="guide-section" aria-labelledby="todo-heading">
      <div class="section-heading">
        <h2 id="todo-heading">待办事项</h2>
        <RouterLink to="/todo">打开待办事项 →</RouterLink>
      </div>
      <ul>
        <li>每行输入一条待办；用单独两行的 <code>```</code> 包住正文，可以添加一条多行待办。</li>
        <li>
          停止输入 1 秒后自动保存草稿；点击添加或按 Command + Return（Windows / Linux 为 Ctrl +
          Enter）提交待办。
        </li>
        <li>
          在待办列表中可以筛选、编辑、完成和删除事项。完成满 7
          天后，下次打开或刷新待办页面时会自动删除；也可逐条设置保留，取消后重新开启自动删除会重新计时。
        </li>
      </ul>
    </section>

    <section class="guide-section" aria-labelledby="two-factor-heading">
      <div class="section-heading">
        <h2 id="two-factor-heading">两步验证</h2>
        <RouterLink to="/2af">打开两步验证 →</RouterLink>
      </div>
      <ul>
        <li>
          输入 Base32 密钥或 TOTP 类型的 otpauth 链接，也可以选择、拖拽或粘贴 PNG、JPEG、WebP
          二维码截图。
        </li>
        <li>
          支持设置 SHA1、SHA256、SHA512 算法，6 位或 8
          位验证码及周期；添加后可查看验证码、密钥和二维码，也可导出 JSON 备份。
        </li>
        <li>
          不支持 HOTP 和 Google Authenticator
          批量迁移二维码。验证码依赖设备时间，请保持系统时间准确。
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.guide-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 64px 24px 48px;
}

.guide-header {
  margin-bottom: 32px;
}

h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.25;
}

.guide-header p {
  margin: 10px 0 0;
  color: var(--color-text-muted);
}

.guide-section {
  margin-top: 16px;
  padding: 24px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.section-heading a {
  color: var(--color-primary);
  font-size: 13px;
}

.section-heading a:hover {
  text-decoration: underline;
}

.guide-section p,
.guide-section ul {
  margin: 12px 0 0;
  color: var(--color-text-soft);
  line-height: 1.8;
}

.guide-section ul {
  padding-left: 20px;
}

.guide-section li + li {
  margin-top: 6px;
}

code {
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.guide-section .notice {
  padding: 12px 14px;
  color: #76551b;
  background: #fff8e9;
  border-radius: 8px;
}

@media (max-width: 700px) {
  .guide-page {
    padding: 40px 16px 32px;
  }

  h1 {
    font-size: 26px;
  }

  .guide-section {
    padding: 20px;
  }
}
</style>
