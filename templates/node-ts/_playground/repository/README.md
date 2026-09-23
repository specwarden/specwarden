# slugline

Turns a title into a URL slug — `"Hello, World!"` becomes `hello-world` — and throws a
reason rather than returning an empty string when nothing is left to slug.

```ts
import { slugify } from 'slugline';

slugify('Ship it on Friday?'); // 'ship-it-on-friday'
```

The whole implementation is `src/slugify.ts`; `src/index.ts` is the one entry point. The
tests in `test/slugify.test.ts` run under node's own runner, with no build step.

`npm run lint` refuses a stray `console.log` in `src/` — a library that prints is a
library its consumers cannot silence.
