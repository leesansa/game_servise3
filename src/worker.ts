// Worker 진입점. 요청(fetch)은 vinext 앱이 그대로 처리하고, Cron 이 부르는 scheduled() 만 여기서 더한다
// (vinext 기본 진입점은 fetch 만 내보내서, Cron 을 쓰려면 이렇게 감싸야 함)
import app from 'vinext/server/fetch-handler'
import { runDaily } from '@/server/jobs/daily'

export * from 'vinext/server/fetch-handler'

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  scheduled(controller, _env, ctx) {
    ctx.waitUntil(runDaily(new Date(controller.scheduledTime)))
  },
} satisfies ExportedHandler<Env>
