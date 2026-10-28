import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const page = join(import.meta.dir, '../artifacts/report.html');
const server = Bun.serve({
  hostname: '127.0.0.1', port: 4317,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET' || !['/', '/report.html'].includes(path)) return new Response('Not found', { status: 404 });
    return new Response(readFileSync(page), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  },
});
console.log(`演示报告：http://${server.hostname}:${server.port}`);
