# tools-tto-me

一个轻量、纯前端、隐私优先的在线工具箱，包含日历、时间戳转换、待办事项和两步验证等实用工具。

所有数据完全保存在浏览器本地（IndexedDB / LocalStorage），不经过任何后端服务器，保证个人数据和密钥隐私安全。

## 功能特性

- 📅 **日历 (Calendar)**：公历与农历对照、二十四节气、法定节假日安排以及每日宜忌展示。
- ⏱️ **时间戳转换 (Timezone Converter)**：支持时间戳与日期时间互相转换，支持批量多行输入、快捷时区切换与本地历史记录。
- 📝 **待办事项 (Todo)**：支持批量快速添加、按日期分组聚合、完成状态管理与到期自动清理，数据本地存储。
- 🔐 **两步验证 (Two-Factor Authenticator)**：基于 RFC 6238 标准的 TOTP 动态验证码工具。支持解析二维码截图、生成动态验证码、展示/隐藏密钥以及本地 JSON 数据备份导出。

## 技术栈

- **框架**：Vue 3 (Composition API) + TypeScript
- **构建工具**：Vite
- **本地存储**：IndexedDB (`idb`)
- **测试**：Vitest（单元测试）+ Playwright（端到端测试）
- **代码规范**：ESLint + Oxlint + Prettier
- **部署**：支持 Cloudflare Pages 静态部署

## 项目快速开始

### 安装依赖

```sh
pnpm install
```

### 开发环境运行

```sh
pnpm dev
```

### 生产环境构建

```sh
pnpm build
```

### 运行测试

```sh
# 运行单元测试
pnpm test:unit

# 运行端到端测试 (Playwright)
pnpm test:e2e
```

### 代码规范检查与格式化

```sh
# 代码 Lint 检查并修复
pnpm lint

# 代码格式化
pnpm format
```

## 部署到 Cloudflare Pages

本项目提供了部署脚本 [`scripts/deploy-cloudflare-pages.mjs`](scripts/deploy-cloudflare-pages.mjs)：

1. 复制配置模版：
   ```sh
   cp .env.cloudflare.example .env.cloudflare
   ```
2. 在 `.env.cloudflare` 中填入你的 Cloudflare 凭据（Account ID 与 API Token）。
3. 执行部署命令：
   ```sh
   pnpm run deploy:pages
   ```

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
