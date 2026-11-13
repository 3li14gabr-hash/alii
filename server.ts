import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { initDatabase, UPLOADS_DIR } from './server/db';
import { authAndAssocRouter } from './server/routes/authAndAssocRoutes';
import { beneficiaryRouter } from './server/routes/beneficiaryRoutes';
import { programsAndFinanceRouter } from './server/routes/programsAndFinanceRoutes';
import { orgAndAdminRouter } from './server/routes/orgAndAdminRoutes';
import { reportsRouter } from './server/routes/reportsRoutes';

async function startServer() {
  initDatabase();

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Serve permanently stored uploads cleanly with safe headers
  app.use(
    '/api/uploads',
    express.static(UPLOADS_DIR, {
      fallthrough: false,
      maxAge: '1h',
    })
  );

  // Mount API routes
  app.use('/api', authAndAssocRouter);
  app.use('/api', beneficiaryRouter);
  app.use('/api', programsAndFinanceRouter);
  app.use('/api', orgAndAdminRouter);
  app.use('/api', reportsRouter);

  // Explicit 404 for unknown API paths
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'نقطة النهاية المطلوبة غير موجودة.' });
  });

  // Error handler for multer / JSON / upload failures
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع في الخادم.';
    res.status(500).json({ error: message });
  });

  // Mount Vite middleware in dev, or serve dist in production
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Khayrna server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
