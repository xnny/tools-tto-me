// Keep these paths in sync with the routes in src/router/index.ts.
const appRoutes = /^\/(?:calendar\/?|timezone(?:\/utc(?:[+-]\d{1,2})?)?\/?|todo\/(?:add|list)\/?|2af\/?|guide\/?|)$/i

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    const pathname = new URL(request.url).pathname

    // Pages falls back to index.html for unknown paths in a single-page app.
    // Preserve real assets and responses, but mark unmatched SPA requests as 404.
    if (
      !appRoutes.test(pathname) &&
      response.status === 200 &&
      response.headers.get('content-type')?.toLowerCase().includes('text/html')
    ) {
      return new Response(response.body, { status: 404, headers: response.headers })
    }

    return response
  },
}
