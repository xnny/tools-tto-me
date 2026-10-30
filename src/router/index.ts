import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/calendar',
      name: 'Calendar',
      component: () => import('@/views/Calendar.vue'),
    },
    {
      path: '/timezone/:zone(utc[+-]\\d{1,2})?',
      name: 'TimezoneConverter',
      component: () => import('@/views/TimezoneConverter.vue')
    },
  ],
})

export default router
