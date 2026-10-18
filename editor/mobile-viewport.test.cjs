const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,readdirSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const source=readFileSync(join(__dirname,'mobile-viewport.js'),'utf8');

function harness({mobile=true,viewport={width:390,height:744,offsetLeft:0,offsetTop:0,scale:1}}={}){
  const styles=new Map(),frames=[],listeners={window:new Map(),document:new Map()};let fits=0;
  const on=where=>(type,fn)=>listeners[where].set(type,fn);
  const document={activeElement:{closest:()=>null},visibilityState:'visible',addEventListener:on('document'),documentElement:{clientWidth:mobile?390:1440,style:{setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key)}}};
  const sandbox=vm.createContext({document,window:{innerWidth:mobile?390:1440,innerHeight:mobile?744:900,visualViewport:viewport,addEventListener:on('window')},compactViewport:{matches:mobile},fit:()=>{fits++;},requestAnimationFrame:fn=>frames.push(fn)});
  vm.runInContext(source,sandbox);
  return {styles,sandbox,frames,get fits(){return fits;},size:()=>vm.runInContext('sizePreview()',sandbox),send:(where,type)=>listeners[where].get(type)?.(),paint:()=>{for(const fn of frames.splice(0))fn();}};
}

test('a phone first load uses the live screen size even if the browser first reports a wide, short view',()=>{
  const h=harness({viewport:{width:980,height:320,offsetLeft:80,offsetTop:20,scale:1}});
  for(const [name,value] of Object.entries({width:980,height:320,left:80,top:20}))h.styles.set('--preview-'+name,value+'px');
  h.size();
  assert.equal(h.styles.size,0);assert.equal(h.fits,1);
  h.sandbox.window.visualViewport={width:390,height:744,offsetLeft:0,offsetTop:0,scale:1};h.send('window','load');h.paint();
  assert.equal(h.styles.size,0);assert.equal(h.fits,3);
});

test('a phone keeps following its screen through tab returns, rotation and browser bar changes',()=>{
  const h=harness();h.size();
  h.sandbox.window.visualViewport.height=600;h.send('window','pageshow');h.paint();
  assert.equal(h.styles.size,0);assert.equal(h.fits,3);
  h.sandbox.document.visibilityState='hidden';h.send('document','visibilitychange');assert.equal(h.fits,3);
  h.sandbox.document.visibilityState='visible';h.send('document','visibilitychange');h.paint();assert.equal(h.fits,5);
  h.send('window','orientationchange');h.paint();assert.equal(h.fits,7);
});

test('a phone keyboard uses the visible area, then clears that size when the field loses focus',()=>{
  const h=harness({viewport:{width:390,height:420,offsetLeft:0,offsetTop:18,scale:1}});
  h.sandbox.document.activeElement={closest:()=>({})};h.send('document','focusin');h.paint();
  assert.deepEqual(Object.fromEntries(h.styles),{'--preview-width':'390px','--preview-height':'420px','--preview-left':'0px','--preview-top':'18px'});
  h.sandbox.document.activeElement={closest:()=>null};h.send('document','focusout');h.paint();assert.equal(h.styles.size,0);
});

test('browser zoom keeps the tools within the visible part of the phone page',()=>{
  const h=harness({viewport:{width:195,height:372,offsetLeft:110,offsetTop:80,scale:2}});h.size();
  assert.deepEqual(Object.fromEntries(h.styles),{'--preview-width':'195px','--preview-height':'372px','--preview-left':'110px','--preview-top':'80px'});
  h.sandbox.window.visualViewport.scale=1;h.size();assert.equal(h.styles.size,0);
});

test('missing, zero and invalid phone sizes leave the screen size in control',()=>{
  for(const viewport of [undefined,{width:0,height:0,scale:1},{width:NaN,height:420,scale:2},{width:980,height:420,scale:2},{width:390,height:0,scale:2}]){
    const h=harness();h.sandbox.window.visualViewport=viewport;h.sandbox.document.activeElement={closest:()=>({})};h.size();assert.equal(h.styles.size,0);
  }
});

test('desktop sizing stays the same and phone lifecycle checks leave it alone',()=>{
  for(const viewport of [{width:1440,height:900,offsetLeft:0,offsetTop:0,scale:1},null]){
    const h=harness({mobile:false,viewport});h.size();
    assert.deepEqual(Object.fromEntries(h.styles),{'--preview-width':'1440px','--preview-height':'900px','--preview-left':'0px','--preview-top':'0px'});
    for(const type of ['load','pageshow','orientationchange'])h.send('window',type);
    for(const type of ['visibilitychange','focusin','focusout'])h.send('document',type);
    assert.equal(h.frames.length,0);assert.equal(h.fits,1);
  }
});

test('saved phone editors include the same screen sizing code',()=>{
  const root=join(__dirname,'..'),files=['index.html',...readdirSync(join(root,'drafts')).map(name=>'drafts/'+name+'/index.html').filter(name=>existsSync(join(root,name)))];
  for(const file of files){
    const html=readFileSync(join(root,file),'utf8');if(!html.includes('function syncToolLayout()'))continue;
    assert.equal(html.split('// BEGIN MOBILE VIEWPORT\n')[1]?.split('// END MOBILE VIEWPORT')[0].trim(),source.trim(),file);
  }
});
