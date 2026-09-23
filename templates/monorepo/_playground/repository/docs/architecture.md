# Architecture

`money` depends on nothing; `api` depends on `money`; `web` depends on nothing but what the
api returns. The build order follows the graph, so `packages/money` is built first —
its whole surface is `packages/money/src/index.ts`.
