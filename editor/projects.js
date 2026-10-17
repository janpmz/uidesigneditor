// Shared by the player editor and its home page.
const projectData=JSON.parse($('initial-projects').textContent);
const localProjects=projectData.projects;
const projectHome=['/','/index.html','/drafts/dark-player-layout/','/drafts/dark-player-layout/index.html'].includes(location.pathname);
const activeProjectKey='ui-design-editor-active-project-v1:'+(projectHome?'/':location.pathname);
const projectListKey='ui-design-editor-projects-v1:'+(projectHome?'/':location.pathname);
function restoreProjectList(saved){
  if(saved?.version!==1||!Array.isArray(saved.projects))return;
  for(const project of saved.projects){
    if(!project||typeof project.id!=='string'||!/^[-a-z0-9]+$/.test(project.id)||typeof project.name!=='string'||!project.name.trim()||localProjects.some(entry=>entry.id===project.id))continue;
    localProjects.push({id:project.id,name:project.name,layout:null});
  }
}
let savedProjectList,savedActiveProject;
try{savedProjectList=JSON.parse(localStorage.getItem(projectListKey)||'null');restoreProjectList(savedProjectList);}catch{}
let activeProject=projectData.active||'player';
try{savedActiveProject=localStorage.getItem(activeProjectKey)||savedProjectList?.active;if(localProjects.some(project=>project.id===savedActiveProject))activeProject=savedActiveProject;}catch{}
function projectStorage(id){return 'dark-'+id+'-layout-v2:'+(projectHome?'/drafts/dark-'+id+'-layout/':location.pathname);}
let STORAGE=projectStorage(activeProject);
const projectSessions=new Map();
let projectSwitchBusy=false;
function localProjectLayout(id){
  const project=localProjects.find(project=>project.id===id);
  let layout=project.layout||(id==='player'?original():{version:1,canvas:{width:393,height:852,background:'#000000'},items:[]});
  try{const embedded=JSON.parse($('initial-layout').textContent);if(id===projectData.active&&validEditorPage(embedded))layout=embedded;}catch{}
  try{const saved=JSON.parse(localStorage.getItem(projectStorage(id))||'null');if(validEditorPage(saved))layout=saved;}catch{}
  return copy(layout);
}
async function readProjectLayout(id){
  let layout=localProjectLayout(id);
  if(pictureDB)try{
    const saved=await new Promise((resolve,reject)=>{
      const request=pictureDB.transaction('drafts').objectStore('drafts').get(projectStorage(id));
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    if(validEditorPage(saved))layout=saved;
  }catch{}
  return layout;
}
function renderProjects(){
  const list=document.querySelector('#editor-pages .project-page-list');
  for(const project of localProjects){
    let button=[...list.querySelectorAll('[data-project]')].find(button=>button.dataset.project===project.id);
    if(!button){
      button=document.createElement('button');button.type='button';button.className='project-page';button.dataset.project=project.id;
      const icon=list.querySelector('svg')?.cloneNode(true);if(icon)button.append(icon);
      button.append(document.createElement('span'));list.append(button);
    }
    button.querySelector('span').textContent=project.name;button.onclick=()=>switchProject(project.id);
  }
  for(const button of document.querySelectorAll('[data-project]')){
    if(button.dataset.project===activeProject)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    button.disabled=projectSwitchBusy||Boolean(imageEditSession);
  }
  const project=localProjects.find(project=>project.id===activeProject);
  document.querySelector('.canvas-area').setAttribute('aria-label',project.name+' layout canvas');
  $('phone').setAttribute('aria-label',project.name+' preview');
}
function keepProjectSession(){
  projectSessions.set(activeProject,{state,history,future,selected:[...selected],view:{...canvasView},scale,zoom:$('zoom').value,customZoom:$('zoom-custom').value});
}
function saveProjectList(){
  const saved={version:1,active:activeProject,projects:localProjects.map(({id,name})=>({id,name}))};
  try{localStorage.setItem(projectListKey,JSON.stringify(saved));localStorage.setItem(activeProjectKey,activeProject);}catch{}
  if(pictureDB)try{pictureDB.transaction('drafts','readwrite').objectStore('drafts').put(saved,projectListKey);}catch{}
}
function openProject(id,layout,session){
  activeProject=id;STORAGE=projectStorage(id);state=layout;
  history=session?.history||[];future=session?.future||[];selected=new Set(session?.selected||[]);
  editing=true;fieldEdit=null;clearCanvasRegion();closeCanvasMenu();closeItemMenu();
  if($('editor-tools').open)$('editor-tools').close();
  if(session?.view){Object.assign(canvasView,session.view);scale=session.scale;$('zoom-custom').value=session.customZoom;$('zoom').value=session.zoom;}
  else resetCanvasView();
  pictureSaved='';pictureSaveWarning=false;
  render();saveProjectList();stage.focus({preventScroll:true});
}
function createProject(layout,fileName){
  save();keepProjectSession();
  const id='project-'+crypto.randomUUID(),base=(fileName||'').replace(/\.[^.]+$/,'').trim()||'New project';
  let name=base,index=2;while(localProjects.some(project=>project.name===name))name=base+' ('+(index++)+')';
  localProjects.push({id,name,layout:copy(layout)});
  openProject(id,copy(layout));
}
async function switchProject(id){
  if(id===activeProject||!localProjects.some(project=>project.id===id)||projectSwitchBusy)return;
  if(imageEditSession){notify('Choose Done or Cancel before switching projects.');return;}
  if(canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open)return;
  projectSwitchBusy=true;renderProjects();
  try{
    await projectsReady;
    if(imageEditSession||canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open)return;
    save();keepProjectSession();
    const session=projectSessions.get(id),layout=session?.state||await readProjectLayout(id);
    openProject(id,layout,session);
  }finally{projectSwitchBusy=false;renderProjects();}
}
function exportProjects(doc){
  const projects=localProjects.map(project=>({...project,layout:project.id===activeProject?state:projectSessions.get(project.id)?.state||localProjectLayout(project.id)}));
  doc.querySelector('#initial-projects').textContent=JSON.stringify({version:1,active:activeProject,projects}).replace(/</g,'\\u003c');
}
function initializeProjects(){
  renderProjects();
  return (async()=>{
    await picturesReady;
    let saved;
    if(pictureDB)try{
      saved=await new Promise((resolve,reject)=>{
        const request=pictureDB.transaction('drafts').objectStore('drafts').get(projectListKey);
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      restoreProjectList(saved);
    }catch{}
    for(const project of localProjects){
      if(project.id===activeProject)continue;
      const layout=await readProjectLayout(project.id);
      projectSessions.set(project.id,{state:layout,history:[],future:[],selected:[],view:null});
      try{localStorage.setItem(projectStorage(project.id),JSON.stringify(layout));}catch{}
      if(pictureDB)try{pictureDB.transaction('drafts','readwrite').objectStore('drafts').put(copy(layout),projectStorage(project.id));}catch{}
    }
    const restoredActive=saved?.active||savedActiveProject;
    if(restoredActive!==activeProject&&projectSessions.has(restoredActive)){
      save();keepProjectSession();const session=projectSessions.get(restoredActive);openProject(restoredActive,session.state,session);
    }
    saveProjectList();renderProjects();
  })();
}
