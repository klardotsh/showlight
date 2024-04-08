# showlight

Running:

```sh
# Install dependencies. Requires NodeJS and npm installed.
$ npm ci --dev

# Launch server listening on 0.0.0.0:9000
$ npx ts-node backend.ts

# Launch frontend listening on 0.0.0.0:8000 with CORS disabled
$ npx esbuild --watch --bundle --outfile=frontend.js frontend.ts & \
	npx http-server -p 8000 --cors
```
