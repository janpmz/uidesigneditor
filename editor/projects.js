// Shared by the player editor and its home page.
const projectData=JSON.parse($('initial-projects').textContent);
const localProjects=projectData.projects;
const projectHome=['/','/index.html','/drafts/dark-player-layout/','/drafts/dark-player-layout/index.html'].includes(location.pathname);
const activeProjectKey='ui-design-editor-active-project-v1:'+(projectHome?'/':location.pathname);
let activeProject=projectData.active||'player';
try{const saved=localStorage.getItem(activeProjectKey);if(localProjects.some(project=>project.id===saved))activeProject=saved;}catch{}
function projectStorage(id){return 'dark-'+id+'-layout-v2:'+(projectHome?'/drafts/dark-'+id+'-layout/':location.pathname);}
let STORAGE=projectStorage(activeProject);
const projectSessions=new Map();
let projectSwitchBusy=false;
function localProjectLayout(id){
  const project=localProjects.find(project=>project.id===id);
  let layout=project.layout||(id==='player'?original():null);
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
    activeProject=id;STORAGE=projectStorage(id);state=layout;
    history=session?.history||[];future=session?.future||[];selected=new Set(session?.selected||[]);
    editing=true;fieldEdit=null;clearCanvasRegion();closeCanvasMenu();closeItemMenu();
    if($('editor-tools').open)$('editor-tools').close();
    if(session?.view){Object.assign(canvasView,session.view);scale=session.scale;$('zoom-custom').value=session.customZoom;$('zoom').value=session.zoom;}
    else resetCanvasView();
    pictureSaved='';pictureSaveWarning=false;
    try{localStorage.setItem(activeProjectKey,id);}catch{}
    render();stage.focus({preventScroll:true});
  }finally{projectSwitchBusy=false;renderProjects();}
}
function exportProjects(doc){
  const projects=localProjects.map(project=>({...project,layout:project.id===activeProject?state:projectSessions.get(project.id)?.state||localProjectLayout(project.id)}));
  doc.querySelector('#initial-projects').textContent=JSON.stringify({version:1,active:activeProject,projects}).replace(/</g,'\\u003c');
}
function initializeProjects(){
  for(const button of document.querySelectorAll('[data-project]'))button.onclick=()=>switchProject(button.dataset.project);
  renderProjects();
  return (async()=>{
    await picturesReady;
    for(const project of localProjects){
      if(project.id===activeProject)continue;
      const layout=await readProjectLayout(project.id);
      projectSessions.set(project.id,{state:layout,history:[],future:[],selected:[],view:null});
      try{localStorage.setItem(projectStorage(project.id),JSON.stringify(layout));}catch{}
      if(pictureDB)try{pictureDB.transaction('drafts','readwrite').objectStore('drafts').put(copy(layout),projectStorage(project.id));}catch{}
    }
  })();
}
