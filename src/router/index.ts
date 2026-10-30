import { createRouter, createWebHistory } from 'vue-router'

const SITE_NAME = 'TTO Tools'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/calendar',
      name: 'Calendar',
      component: () => import('@/views/CalendarView.vue'),
      meta: { title: '日历' },
    },
    {
      path: '/timezone/:zone(utc|utc[+-]\\d{1,2})?',
      name: 'TimezoneConverter',
      component: () => import('@/views/TimezoneConverter.vue'),
      meta: { title: '时间戳转换' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: '页面未找到' },
    },
  ],
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME
})

export default router
