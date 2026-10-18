import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createSpaceServer } from './index.mjs';

const layout={version:1,canvas:{width:400,height:300,background:'#fff'},items:[{id:'hello',kind:'label',x:20,y:20,w:200,h:40,text:'Hello'}]};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
async function setup(t,options={}){
  const app=await createSpaceServer(options);app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  t.after(()=>app.close());const base='http://127.0.0.1:'+app.server.address().port;
  async function request(path,method='GET',body,spaceId){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(spaceId?{Authorization:'Bearer '+spaceId}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  }
  const {data:{spaceId}}=await request('/api/spaces','POST');
  async function connect(space=spaceId){
    const ws=new WebSocket(base.replace('http:','ws:')+'/ws');await once(ws,'open');
    const message=once(ws,'message');ws.send(JSON.stringify({type:'join_space',payload:{spaceId:space}}));
    const connected=JSON.parse((await message)[0]);return {ws,clientId:connected.payload.clientId};
  }
  return {app,base,request,spaceId,connect};
}

test('connections have distinct IDs, join one Space, receive JSON notices after save, and leave on close',async t=>{
  const {app,request,spaceId,connect}=await setup(t);
  const first=await connect(),second=await connect();
  const {data:{spaceId:otherSpace}}=await request('/api/spaces','POST');const other=await connect(otherSpace);
  assert.notEqual(first.clientId,second.clientId);assert.equal(app.clients.get(spaceId).size,2);
  let otherNotices=0;other.ws.on('message',()=>otherNotices++);
  const notices=[once(first.ws,'message'),once(second.ws,'message')];
  assert.equal((await request('/api/projects/demo','PUT',{name:'Demo',version:0,layout},spaceId)).status,200);
  for(const notice of notices)assert.deepEqual(JSON.parse((await notice)[0]),{type:'project_changed',payload:{projectId:'demo',version:1}});
  assert.equal((await request('/api/projects/demo','GET',null,spaceId)).data.layout.items[0].text,'Hello');
  assert.equal(otherNotices,0);
  const serverSocket=app.clients.get(spaceId).get(first.clientId),closed=once(serverSocket,'close');
  first.ws.close();await closed;
  assert.equal(app.clients.get(spaceId).size,1);
});

test('old and concurrent saves fail without replacing the newer saved project; deletes keep their version',async t=>{
  const {request,spaceId}=await setup(t);
  const save=(version,text)=>request('/api/projects/demo','PUT',{version,name:'Demo',layout:{...layout,items:[{...layout.items[0],text}]}},spaceId);
  await save(0,'First');
  const attempts=await Promise.all([save(1,'Second'),save(1,'Third')]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  assert.equal((await save(0,'Old')).status,409);
  assert.equal((await request('/api/projects/demo','DELETE',{version:1},spaceId)).status,409);
  assert.equal((await request('/api/projects/demo','DELETE',{version:2},spaceId)).status,200);
  assert.equal((await save(0,'Resurrect')).status,409);
  assert.equal((await request('/api/projects','GET',null,spaceId)).data.projects[0].deleted,1);
});

test('pictures live apart from designs, deduplicate within a Space, and stay private to that Space',async t=>{
  const {request,spaceId}=await setup(t);
  const {data:{id}}=await request('/api/pictures','POST',{src:png},spaceId);
  assert.equal((await request('/api/pictures','POST',{src:png},spaceId)).data.id,id);
  const image={id:'image',kind:'image',x:0,y:0,w:100,h:100,src:'picture:'+id};
  assert.equal((await request('/api/projects/picture','PUT',{version:0,name:'Picture',layout:{...layout,items:[image]}},spaceId)).status,200);
  const saved=(await request('/api/projects/picture','GET',null,spaceId)).data;
  assert.equal(saved.layout.items[0].src,'picture:'+id);assert.equal(JSON.stringify(saved).includes(png),false);
  const {data:{spaceId:other}}=await request('/api/spaces','POST');
  assert.equal((await request('/api/pictures/'+id,'GET',null,other)).status,404);
  assert.equal((await request('/api/projects/picture','GET',null,other)).status,404);
  assert.equal((await request('/api/projects/bad','PUT',{version:0,name:'Bad',layout:{...layout,items:[image]}},other)).status,400);
});

test('saved work survives a server restart and private files never go through the site file server',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'ui-spaces-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  let app=await createSpaceServer({database:join(folder,'spaces.sqlite'),publicDir:folder});
  const {spaceId}=app.store.createSpace();app.store.save(spaceId,'demo',{version:0,name:'Demo',layout});await app.close();
  app=await createSpaceServer({database:join(folder,'spaces.sqlite'),publicDir:folder});t.after(()=>app.close());
  assert.equal(app.store.get(spaceId,'demo').layout.items[0].text,'Hello');
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  for(const path of ['/spaces.sqlite','/server/index.mjs','/.git/config','/package.json','/api/projects'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/api/spaces',{method:'POST',headers:{Origin:'https://elsewhere.example'}})).status,403);
});
