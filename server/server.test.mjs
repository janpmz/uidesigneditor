import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createSpaceServer } from './index.mjs';

const layout={version:1,canvas:{width:400,height:300,background:'#fff'},items:[{id:'hello',kind:'label',x:20,y:20,w:200,h:40,text:'Hello'}]};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const gif='data:image/gif;base64,'+(await readFile(new URL('../tests/fixtures/animated.gif',import.meta.url))).toString('base64');
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

test('pictures are PNG files in Space and project folders, with only names in SQLite',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'ui-picture-files-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const database=join(folder,'spaces.sqlite');
  const {request,spaceId}=await setup(t,{database,publicDir:folder});
  const {data:{id},status}=await request('/api/projects/picture/pictures','POST',{src:png},spaceId);
  assert.equal(status,200);
  assert.equal((await request('/api/projects/picture/pictures','POST',{src:png},spaceId)).data.id,id);
  const files=join(folder,'pictures',spaceId,'picture');
  assert.deepEqual(await readdir(files),[id+'.png']);
  assert.deepEqual(await readFile(join(files,id+'.png')),Buffer.from(png.split(',')[1],'base64'));
  assert.equal((await request('/api/projects/picture/pictures/'+id,'GET',null,spaceId)).data.src,png);
  const image={id:'image',kind:'image',x:0,y:0,w:100,h:100,src:'picture:'+id};
  assert.equal((await request('/api/projects/picture','PUT',{version:0,name:'Picture',layout:{...layout,items:[image]}},spaceId)).status,200);
  const saved=(await request('/api/projects/picture','GET',null,spaceId)).data;
  assert.equal(saved.layout.items[0].src,'picture:'+id);assert.equal(JSON.stringify(saved).includes(png),false);
  const {data:{spaceId:other}}=await request('/api/spaces','POST');
  assert.equal((await request('/api/projects/picture/pictures/'+id,'GET',null,other)).status,404);
  assert.equal((await request('/api/projects/picture','GET',null,other)).status,404);
  assert.equal((await request('/api/projects/bad','PUT',{version:0,name:'Bad',layout:{...layout,items:[image]}},other)).status,400);
  assert.equal((await request('/api/projects/copy/pictures/'+id,'GET',null,spaceId)).status,404);
  assert.equal((await request('/api/projects/copy','PUT',{version:0,name:'Copy',layout:{...layout,items:[image]}},spaceId)).status,400);
  assert.equal((await request('/api/projects/copy/pictures','POST',{src:png},spaceId)).data.id,id);
  assert.equal((await request('/api/projects/copy','PUT',{version:0,name:'Copy',layout:{...layout,items:[image]}},spaceId)).status,200);
  assert.deepEqual(await readFile(join(folder,'pictures',spaceId,'copy',id+'.png')),Buffer.from(png.split(',')[1],'base64'));
  assert.equal((await request('/pictures/'+spaceId+'/picture/'+id+'.png')).status,404);
  const db=new DatabaseSync(database);
  assert.deepEqual(db.prepare('PRAGMA table_info(project_pictures)').all().map(column=>column.name),['space_id','project_id','id','filename']);
  assert.deepEqual(db.prepare('SELECT filename FROM project_pictures ORDER BY project_id').all().map(row=>row.filename),[id+'.png',id+'.png']);
  db.close();
});

test('picture uploads reject invalid files and cannot escape a project folder',async t=>{
  const {app,request,spaceId}=await setup(t);
  for(const src of ['not a picture','data:image/png;base64,SGVsbG8=','data:image/gif;base64,SGVsbG8=',gif.replace('image/gif','image/png'),png.replace('image/png','image/gif')])assert.equal((await request('/api/projects/demo/pictures','POST',{src},spaceId)).status,400);
  assert.throws(()=>app.store.putPicture(spaceId,'../outside',png),/Invalid picture path/);
  assert.throws(()=>app.store.getPicture(spaceId,'../outside','a'.repeat(64)),/Invalid picture path/);
  assert.equal((await request('/api/projects/demo/pictures','POST',{src:png})).status,404);
});
test('Space saves keep the original GIF file and its type',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'ui-gif-files-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const {request,spaceId}=await setup(t,{database:join(folder,'spaces.sqlite'),publicDir:folder});
  const uploaded=await request('/api/projects/motion/pictures','POST',{src:gif},spaceId);
  assert.equal(uploaded.status,200);const {id}=uploaded.data;
  assert.deepEqual(await readFile(join(folder,'pictures',spaceId,'motion',id+'.gif')),Buffer.from(gif.split(',')[1],'base64'));
  assert.equal((await request('/api/projects/motion/pictures/'+id,'GET',null,spaceId)).data.src,gif);
  assert.equal((await request('/api/projects/motion/pictures','POST',{src:gif},spaceId)).data.id,id);
  const image={id:'gif',kind:'image',x:10,y:20,w:64,h:48,src:'picture:'+id};
  assert.equal((await request('/api/projects/motion','PUT',{version:0,name:'Motion',layout:{...layout,items:[image]}},spaceId)).status,200);
  assert.deepEqual((await request('/api/projects/motion','GET',null,spaceId)).data.layout.items,[image]);
  assert.equal((await request('/api/projects/other/pictures/'+id,'GET',null,spaceId)).status,404);
});

test('MP4 saves keep the clip bytes and file type within its project',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'ui-mp4-files-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const {request,spaceId}=await setup(t,{database:join(folder,'spaces.sqlite'),publicDir:folder});
  const bytes=await readFile(new URL('../assets/landing-screen-recording-153438-10s.mp4',import.meta.url));
  const src='data:video/mp4;base64,'+bytes.toString('base64');
  const uploaded=await request('/api/projects/motion/pictures','POST',{src},spaceId);
  assert.equal(uploaded.status,200);const {id}=uploaded.data;
  assert.deepEqual(await readFile(join(folder,'pictures',spaceId,'motion',id+'.mp4')),bytes);
  assert.equal((await request('/api/projects/motion/pictures/'+id,'GET',null,spaceId)).data.src,src);
  const clip={id:'clip',kind:'video',x:10,y:20,w:504,h:506,src:'picture:'+id};
  assert.equal((await request('/api/projects/motion','PUT',{version:0,name:'Motion',layout:{...layout,items:[clip]}},spaceId)).status,200);
  assert.deepEqual((await request('/api/projects/motion','GET',null,spaceId)).data.layout.items,[clip]);
  assert.equal((await request('/api/projects/other/pictures/'+id,'GET',null,spaceId)).status,404);
  for(const invalid of ['data:video/mp4;base64,SGVsbG8=',png.replace('image/png','video/mp4')]){
    assert.equal((await request('/api/projects/motion/pictures','POST',{src:invalid},spaceId)).status,400);
  }
});

test('saved work survives a server restart and private files never go through the site file server',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'ui-spaces-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  let app=await createSpaceServer({database:join(folder,'spaces.sqlite'),publicDir:folder});
  const {spaceId}=app.store.createSpace();
  const {id}=app.store.putPicture(spaceId,'demo',png);
  const {id:gifId}=app.store.putPicture(spaceId,'demo',gif);
  const savedLayout={...layout,items:[...layout.items,{id:'picture',kind:'image',x:0,y:0,w:10,h:10,src:'picture:'+id}]};
  app.store.save(spaceId,'demo',{version:0,name:'Demo',layout:savedLayout});await app.close();
  app=await createSpaceServer({database:join(folder,'spaces.sqlite'),publicDir:folder});t.after(()=>app.close());
  assert.equal(app.store.get(spaceId,'demo').layout.items[0].text,'Hello');
  assert.equal(app.store.getPicture(spaceId,'demo',id).src,png);
  assert.equal(app.store.getPicture(spaceId,'demo',gifId).src,gif);
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  for(const path of ['/spaces.sqlite','/server/index.mjs','/.git/config','/package.json','/api/projects'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/api/spaces',{method:'POST',headers:{Origin:'https://elsewhere.example'}})).status,403);
});
