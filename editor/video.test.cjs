const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');

const source=readFileSync(join(__dirname,'image-drop.js'),'utf8');
const helpers=source.split('// BEGIN PICTURE HELPERS')[1].split('// END PICTURE HELPERS')[0];
const reader=source.split('// BEGIN PICTURE READER')[1].split('// END PICTURE READER')[0];
const validation=source.slice(source.indexOf('function validEditorPage('),source.indexOf('async function readEditorPage('));
const bytes=readFileSync(join(__dirname,'../assets/landing-screen-recording-153438-10s.mp4'));
const mp4='data:video/mp4;base64,'+bytes.toString('base64');

test('MP4 imports keep the clip bytes and size, including files without a type',async()=>{
  let cleaned=0;
  const sandbox=vm.createContext({Blob,setTimeout,clearTimeout,
    file:new File([bytes],'clip.MP4'),
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>cleaned++},
    document:{createElement(tag){assert.equal(tag,'video');return {
      videoWidth:504,videoHeight:506,removeAttribute(){},load(){},
      set src(value){queueMicrotask(()=>this.onloadedmetadata());},
    };}},
    FileReader:class{async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}},
  });
  vm.runInContext(helpers+reader,sandbox);
  const clip=await vm.runInContext('readPicture(file)',sandbox);
  assert.equal(clip.kind,'video');assert.equal(clip.src,mp4);
  assert.deepEqual([clip.width,clip.height],[504,506]);assert.equal(cleaned,1);
  sandbox.file={name:'large.mp4',size:30000000};
  await assert.rejects(vm.runInContext('readPicture(file)',sandbox),/under 30 MB/);
});

test('bad MP4s report a clear error and release their file',async()=>{
  let released=false;
  const sandbox=vm.createContext({Blob,setTimeout,clearTimeout,file:new File(['bad'],'bad.mp4'),
    URL:{createObjectURL:()=> 'blob:bad',revokeObjectURL:()=>released=true},
    document:{createElement(){return {removeAttribute(){},load(){},set src(value){queueMicrotask(()=>this.onerror());}};}},
  });
  vm.runInContext(helpers+reader,sandbox);
  await assert.rejects(vm.runInContext('readPicture(file)',sandbox),/Could not open this MP4/);
  assert.equal(released,true);
});

test('video HTML copies accept clip data and reject outside or active sources',()=>{
  const sandbox=vm.createContext({src:mp4});vm.runInContext(helpers+validation,sandbox);
  const check=()=>vm.runInContext('validEditorPage({version:1,canvas:{width:800,height:600},items:[{kind:"video",x:0,y:0,w:200,h:200,src}]})',sandbox);
  assert.equal(check(),true);
  for(const src of ['https://example.com/video.mp4','javascript:alert(1)','data:text/html;base64,AAAA','data:image/png;base64,AAAA']){
    sandbox.src=src;assert.equal(check(),false);
  }
});

test('video redraws reuse the playing clip and keep sound off',()=>{
  let created=0,played=0;
  const video={attrs:{},currentTime:4,getAttribute(name){return this.attrs[name];},setAttribute(name,value){this.attrs[name]=value;},set src(value){this.attrs.src=value;},play(){played++;return Promise.resolve();}};
  const sandbox=vm.createContext({entry:{id:'clip',name:'Clip',src:mp4},content:{append(node){assert.equal(node,video);}},document:{createElement(){created++;return video;}},previous:new Map()});
  vm.runInContext(helpers+source.slice(source.indexOf('function renderVideo('),source.indexOf('function pictureDeadline(')),sandbox);
  vm.runInContext('renderVideo(content,entry,previous)',sandbox);
  sandbox.previous.set('clip',video);vm.runInContext('renderVideo(content,entry,previous)',sandbox);
  assert.equal(created,1);assert.equal(played,2);assert.equal(video.currentTime,4);
  for(const field of ['autoplay','muted','defaultMuted','playsInline','loop'])assert.equal(video[field],true);
});

test('new visitors start with just four clips on the dotted canvas',()=>{
  const html=readFileSync(join(__dirname,'../index.html'),'utf8');
  const data=JSON.parse(html.match(/id="initial-projects">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.active,'landing');assert.equal(data.projects[0].id,'landing');
  const {canvas,items}=data.projects[0].layout;
  assert.equal(canvas.background,'transparent');assert.equal(items.length,4);
  for(const item of items){
    assert.equal(item.kind,'video');assert.equal(item.borderWidth,0);
    assert.ok(readFileSync(join(__dirname,'..'+item.src)).length>100000);
  }
  const centers=items.map(item=>({x:item.x+item.w/2,y:item.y+item.h/2}));
  assert.equal(centers[0].x,centers[2].x);assert.equal(centers[1].x,centers[3].x);
  assert.equal(centers[0].y,centers[1].y);assert.equal(centers[2].y,centers[3].y);
  assert.ok(items[2].y-(items[0].y+items[0].h)>=96);
});
