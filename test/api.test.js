import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { createDatabase } from '../src/database.js';

let app, base, db;
before(async()=>{db=createDatabase(':memory:');app=createApp({db});await new Promise(resolve=>app.server.listen(0,resolve));base=`http://127.0.0.1:${app.server.address().port}`;});
after(async()=>{await new Promise(resolve=>app.server.close(resolve));db.close();});
async function request(path, options={}){const res=await fetch(base+path,{headers:{'content-type':'application/json'},...options});return {status:res.status,data:await res.json()};}

test('health endpoint reports service status',async()=>{const r=await request('/api/health');assert.equal(r.status,200);assert.equal(r.data.service,'applytrack');});
test('lists seeded applications and filters by stage',async()=>{const all=await request('/api/applications');assert.equal(all.data.total,5);const filtered=await request('/api/applications?status=interview');assert.equal(filtered.data.items.length,1);assert.equal(filtered.data.items[0].company,'Northstar Labs');});
test('creates an application and records an audit event',async()=>{const created=await request('/api/applications',{method:'POST',body:JSON.stringify({company:'Acme',role:'Java Engineer',status:'applied',location:'Hyderabad'})});assert.equal(created.status,201);const id=created.data.item.id;const events=await request(`/api/applications/${id}/activity`);assert.equal(events.data.items[0].eventType,'created');});
test('rejects invalid transitions without mutating the record',async()=>{const first=(await request('/api/applications?status=saved')).data.items[0];const r=await request(`/api/applications/${first.id}/transition`,{method:'POST',body:JSON.stringify({status:'offer'})});assert.equal(r.status,409);const unchanged=await request(`/api/applications/${first.id}`);assert.equal(unchanged.data.item.status,'saved');});
test('enforces optimistic concurrency for edits',async()=>{const app=(await request('/api/applications')).data.items[0];const update={version:app.version,notes:'Updated note'};assert.equal((await request(`/api/applications/${app.id}`,{method:'PATCH',body:JSON.stringify(update)})).status,200);const stale=await request(`/api/applications/${app.id}`,{method:'PATCH',body:JSON.stringify(update)});assert.equal(stale.status,409);});
test('validates required fields and date formats',async()=>{assert.equal((await request('/api/applications',{method:'POST',body:JSON.stringify({company:'',role:'Engineer'})})).status,422);assert.equal((await request('/api/applications',{method:'POST',body:JSON.stringify({company:'Acme',role:'Engineer',appliedAt:'yesterday'})})).status,422);});
