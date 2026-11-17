import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createDatabase } from './database.js';
import { createApplication, getApplication, listApplications, updateApplication, transitionApplication, applicationActivity, summary } from './domain.js';
import { bodyJson, fail, json, staticFile } from './http.js';

const here = dirname(fileURLToPath(import.meta.url));
export function createApp({ db = createDatabase(':memory:'), publicDir = resolve(here,'../public') } = {}) {
  const server = httpServer(async (req,res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res,200,{status:'ok',service:'applytrack'});
      if (req.method === 'GET' && url.pathname === '/api/summary') return json(res,200,summary(db));
      if (req.method === 'GET' && url.pathname === '/api/applications') return json(res,200,listApplications(db,url.searchParams));
      if (req.method === 'POST' && url.pathname === '/api/applications') return json(res,201,{item:createApplication(db,await bodyJson(req))});
      const match = url.pathname.match(/^\/api\/applications\/([\w-]+)(?:\/(transition|activity))?$/);
      if (match) {
        const [,id,action] = match;
        if (req.method === 'GET' && !action) return json(res,200,{item:getApplication(db,id)});
        if (req.method === 'PATCH' && !action) return json(res,200,{item:updateApplication(db,id,await bodyJson(req))});
        if (req.method === 'POST' && action === 'transition') return json(res,200,{item:transitionApplication(db,id,await bodyJson(req))});
        if (req.method === 'GET' && action === 'activity') return json(res,200,{items:applicationActivity(db,id)});
      }
      if (req.method === 'GET' && (url.pathname === '/' || ['/app.js','/styles.css'].includes(url.pathname))) {
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (await staticFile(res,publicDir,file)) return;
      }
      return json(res,404,{error:'Route not found'});
    } catch (error) { return fail(res,error); }
  });
  return { server, db };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createApp({ db: createDatabase() });
  const port = Number(process.env.PORT || 3001);
  server.listen(port, () => console.log(`ApplyTrack running at http://localhost:${port}`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
