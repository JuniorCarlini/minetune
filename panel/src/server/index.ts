import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { Auth, clientIp } from './auth.ts';
import { loadPanelConfig } from './config.ts';
import { createServices } from './context.ts';
import { apiRoutes } from './routes.ts';

const config = loadPanelConfig();
const services = createServices(config);
const auth = new Auth(config.PANEL_PASSWORD, config.PANEL_SESSION_SECRET);

const app = new Hono();

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://cdn.modrinth.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }),
);

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/login', async (c) => {
  const ip = clientIp(c);
  if (!auth.allowAttempt(ip)) return c.json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);

  const body = z.object({ password: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success || !auth.checkPassword(body.data.password)) {
    return c.json({ error: 'Senha incorreta' }, 401);
  }
  auth.clearAttempts(ip);
  auth.startSession(c);
  return c.json({ ok: true });
});

app.post('/api/logout', (c) => {
  auth.endSession(c);
  return c.json({ ok: true });
});

app.get('/api/me', (c) => c.json({ authenticated: auth.isAuthenticated(c), instance: config.INSTANCE_NAME }));

app.use('/api/*', auth.middleware(['/api/health', '/api/login', '/api/logout', '/api/me']));
app.route('/api', apiRoutes(services));
app.all('/api/*', (c) => c.json({ error: 'Rota não encontrada' }, 404));

// Frontend (SPA): arquivos estáticos e fallback para index.html.
app.use('/*', serveStatic({ root: config.WEB_DIR }));
app.get('*', async (c) => {
  try {
    return c.html(await readFile(join(config.WEB_DIR, 'index.html'), 'utf8'));
  } catch {
    return c.text('Frontend não compilado. Rode `npm run build` ou use `npm run dev`.', 503);
  }
});

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`minetune panel ouvindo em :${info.port} (instância ${config.INSTANCE_NAME})`);
});

const shutdown = () => {
  services.rcon.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
