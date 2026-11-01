export interface ToolItem {
  /** 路由名称 */
  name: string
  /** 跳转路径 */
  path: string
  title: string
  description: string
  /** 24x24 线性图标的 path 数据 */
  icon: string
  /** 图标主题色 */
  color: string
}

export const tools: ToolItem[] = [
  {
    name: 'Calendar',
    path: '/calendar',
    title: '日历',
    description: '查看公历、农历、节气与法定节假日，附每日宜忌。',
    icon: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 8h2m3 0h2m-7 3h2m3 0h2',
    color: '#f97362',
  },
  {
    name: 'TimezoneConverter',
    path: '/timezone',
    title: '时间戳转换',
    description: '时间戳与日期时间互相转换，支持批量输入与 UTC 时区切换。',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l2.5 2.5',
    color: '#3b82f6',
  },
  {
    name: 'Todo',
    path: '/todo',
    title: '待办事项',
    description: '本地保存待办，支持批量添加、多行内容与完成状态管理。',
    icon: 'M9 5h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2m2-2h6v4H9V3Zm-1 11 3 3 5-6',
    color: '#16a085',
  },
]
