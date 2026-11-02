// Local dev server: mounts the same handlers Vercel runs from /api, and serves the
// React app through Vite middleware. Start with: npm run dev  (reads .env)
import express from 'express';
import { createServer as createVite } from 'vite';
import upload from '../api/upload.js';
import task from '../api/task.js';
import config from '../api/config.js';
import identify from '../api/identify.js';

const app = express();
app.use(express.json({ limit: '6mb' }));

app.all('/api/upload', upload);
app.all('/api/task', task);
app.all('/api/config', config);
app.all('/api/identify', identify);

const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
app.use(vite.middlewares);

const port = Number(process.env.PORT) || 5173;
app.listen(port, () => console.log(`MirrorMate running at http://localhost:${port}`));
