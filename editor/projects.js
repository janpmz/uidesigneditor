// Shared by the player editor and its home page.
const projectData=JSON.parse($('initial-projects').textContent);
const localProjects=projectData.projects;
const projectHome=['/','/index.html','/drafts/dark-player-layout/','/drafts/dark-player-layout/index.html'].includes(location.pathname);
let spaceClient=null;
const lastSpaceKey='ui-design-editor-last-space-v1';
const spaceLink=(location.hash||'').match(/^#space=([a-f0-9]{64})(?:&project=([-a-zA-Z0-9]{1,200}))?$/);
let onlineSpaceId=location.protocol==='file:'?null:spaceLink?.[1]||null;
const linkedProject=onlineSpaceId?spaceLink?.[2]||null:null;
if(['http:','https:'].includes(location.protocol)&&!onlineSpaceId){
  try{const saved=localStorage.getItem(lastSpaceKey);if(/^[a-f0-9]{64}$/.test(saved||''))onlineSpaceId=saved;}catch{}
  if(onlineSpaceId)window.history.replaceState(null,'','#space='+onlineSpaceId);
}
function projectScope(){return onlineSpaceId?'space:'+onlineSpaceId:(projectHome?'/':location.pathname);}
let activeProjectKey='ui-design-editor-active-project-v1:'+projectScope();
let projectListKey='ui-design-editor-projects-v1:'+projectScope();
const deletedProjects=new Set();
function restoreProjectList(saved){
  if(saved?.version!==1||!Array.isArray(saved.projects))return;
  for(const id of Array.isArray(saved.deleted)?saved.deleted:[])if(typeof id==='string'&&/^[-a-z0-9]+$/.test(id))deletedProjects.add(id);
  for(let index=localProjects.length-1;index>=0;index--)if(deletedProjects.has(localProjects[index].id))localProjects.splice(index,1);
  for(const project of saved.projects){
    if(!project||typeof project.id!=='string'||!/^[-a-z0-9]+$/.test(project.id)||typeof project.name!=='string'||!project.name.trim()||deletedProjects.has(project.id))continue;
    const existing=localProjects.find(entry=>entry.id===project.id);
    if(existing)existing.name=project.name;
    else localProjects.push({id:project.id,name:project.name,layout:null});
  }
}
function blankProjectLayout(){return {version:1,canvas:{width:393,height:852,background:'#000000'},items:[]};}
function blankProject(){return {id:'project-'+crypto.randomUUID(),name:'New project',layout:blankProjectLayout()};}
let savedProjectList,savedActiveProject;
try{savedProjectList=JSON.parse(localStorage.getItem(projectListKey)||'null');restoreProjectList(savedProjectList);}catch{}
if(!localProjects.length)localProjects.push(blankProject());
let activeProject=projectData.active||'player';
try{savedActiveProject=localStorage.getItem(activeProjectKey)||savedProjectList?.active;if(localProjects.some(project=>project.id===savedActiveProject))activeProject=savedActiveProject;}catch{}
if(!localProjects.some(project=>project.id===activeProject))activeProject=localProjects[0].id;
function projectStorage(id){return 'dark-'+id+'-layout-v2:'+(onlineSpaceId?'space:'+onlineSpaceId:(projectHome?'/drafts/dark-'+id+'-layout/':location.pathname));}
let STORAGE=projectStorage(activeProject);
const projectSessions=new Map();
let projectSwitchBusy=false;
const projectVideoLoads=new Map();
async function inlineProjectVideos(layout){
  for(const entry of layout.items){
    if(entry.kind==='video'&&/^\/assets\/landing-[a-z0-9-]+\.mp4$/.test(entry.src)){
      const src=entry.src;
      if(!projectVideoLoads.has(src))projectVideoLoads.set(src,(async()=>{
        const response=await fetch(src);if(!response.ok)throw new Error('Could not open a sample video.');
        const blob=await response.blob();
        return new Promise((resolve,reject)=>{
          const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not open a sample video.'));reader.readAsDataURL(new Blob([blob],{type:'video/mp4'}));
        });
      })());
      try{entry.src=await projectVideoLoads.get(src);}catch(error){projectVideoLoads.delete(src);throw error;}
    }
    if(entry.imageContents)await inlineProjectVideos(entry.imageContents);
  }
  return layout;
}
function localProjectLayout(id){
  const project=localProjects.find(project=>project.id===id);
  let layout=project.layout||(id==='player'?original():blankProjectLayout());
  try{const embedded=JSON.parse($('initial-layout').textContent);if(id===projectData.active&&validEditorPage(embedded))layout=embedded;}catch{}
  try{const saved=JSON.parse(localStorage.getItem(projectStorage(id))||'null');if(validEditorPage(saved))layout=saved;}catch{}
  return copy(layout);
}
async function readProjectLayout(id){
  let layout=localProjectLayout(id);
  try{
    const key=projectStorage(id);
    const saved=await usePictureStore('readonly',store=>store.get(key));
    if(validEditorPage(saved))layout=saved;
  }catch{}
  return inlineProjectVideos(layout);
}
function renderProjects(){
  const list=document.querySelector('#editor-pages .project-page-list');
  $('project-new').disabled=projectSwitchBusy||Boolean(imageEditSession);
  for(const row of list.querySelectorAll('[data-project-row]'))if(!localProjects.some(project=>project.id===row.dataset.projectRow))row.remove();
  for(const project of localProjects){
    let button=[...list.querySelectorAll('[data-project]')].find(button=>button.dataset.project===project.id);
    if(!button){
      const row=document.createElement('div');row.className='project-page-row';row.dataset.projectRow=project.id;
      button=document.createElement('button');button.type='button';button.className='project-page';button.dataset.project=project.id;
      button.innerHTML=projectPageIcon;
      button.append(document.createElement('span'));row.append(button);
      const remove=document.createElement('button');remove.type='button';remove.className='project-delete';remove.dataset.deleteProject=project.id;remove.innerHTML=projectDeleteIcon;
      row.append(remove);list.append(row);
    }
    button.querySelector('span').textContent=project.name;button.onclick=()=>switchProject(project.id);
    const remove=[...list.querySelectorAll('[data-delete-project]')].find(button=>button.dataset.deleteProject===project.id);
    remove.setAttribute('aria-label','Delete '+project.name);remove.title='Delete '+project.name;
    remove.disabled=projectSwitchBusy||Boolean(imageEditSession);remove.onclick=()=>deleteProject(project.id);
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
function projectListData(projects=localProjects,active=activeProject,deleted=deletedProjects){
  return {version:1,active,projects:projects.map(({id,name})=>({id,name})),deleted:[...deleted]};
}
function saveProjectList(){
  const saved=projectListData();
  try{localStorage.setItem(projectListKey,JSON.stringify(saved));localStorage.setItem(activeProjectKey,activeProject);}catch{}
  const key=projectListKey;
  usePictureStore('readwrite',store=>store.put(saved,key)).catch(()=>{});
  spaceClient?.changed();
}
function renameProject(name){
  if(typeof name!=='string'||!name.trim()||name.length>200)throw new Error('Use a project name from 1 to 200 characters.');
  const project=localProjects.find(project=>project.id===activeProject);
  if(!project)throw new Error('Unknown project id.');
  if(project.name===name.trim())return;
  project.name=name.trim();renderProjects();saveProjectList();
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
async function createBlankProject(){
  if(projectSwitchBusy)return;
  if(imageEditSession){notify('Choose Done or Cancel before creating a project.');return;}
  if(canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open)return;
  projectSwitchBusy=true;renderProjects();
  try{
    await projectsReady;
    await spaceClient?.ready;
    if(imageEditSession||canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open)return;
    createProject(blankProjectLayout(),'New Project');
  }finally{projectSwitchBusy=false;renderProjects();}
}
$('project-new').onclick=createBlankProject;
async function switchProject(id){
  if(id===activeProject||!localProjects.some(project=>project.id===id)||projectSwitchBusy)return;
  if(imageEditSession){notify('Choose Done or Cancel before switching projects.');return;}
  if(canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open)return;
  projectSwitchBusy=true;renderProjects();
  try{
    await projectsReady;
    await spaceClient?.ready;
    if(imageEditSession||canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open)return;
    save();keepProjectSession();
    const session=projectSessions.get(id),layout=session?.state||await readProjectLayout(id);
    openProject(id,layout,session);
  }finally{projectSwitchBusy=false;renderProjects();}
}
const projectPageIcon='<svg viewBox="0 0 16 18" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M9.5 1.5H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6L9.5 1.5Z"/><path d="M9 1.5V6h5M5 10h6M5 13h4"/></svg>';
const projectDeleteIcon='<svg viewBox="0 0 16 18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M2 4.5h12M6 4.5v-2h4v2M3.5 4.5l.7 11h7.6l.7-11M6.5 7v6M9.5 7v6"/></svg>';
const projectDeleteDialog=$('project-delete-dialog');
function confirmProjectDeletion(project){
  const cancel=$('project-delete-cancel'),confirm=$('project-delete-confirm');
  let finalStep=false,committing=false;
  $('project-delete-title').textContent='Delete “'+project.name+'”?';
  $('project-delete-help').textContent=onlineSpaceId?'This will delete the project from this Space for everyone with its link. You can’t undo this.':'This will delete the project and its saved work from this browser. You can’t undo this.';
  confirm.textContent='Continue';confirm.classList.remove('danger');cancel.disabled=confirm.disabled=false;
  return new Promise(resolve=>{
    projectDeleteDialog.addEventListener('close',()=>resolve(false),{once:true});
    projectDeleteDialog.oncancel=event=>{if(committing)event.preventDefault();};
    cancel.onclick=()=>projectDeleteDialog.close();
    confirm.onclick=event=>{
      if(committing||event?.detail>1)return;
      if(finalStep){committing=true;cancel.disabled=confirm.disabled=true;resolve(true);return;}
      finalStep=true;
      $('project-delete-title').textContent='Delete “'+project.name+'” for good?';
      $('project-delete-help').textContent='The project, its pictures and all undo steps will be lost. It won’t come back when you reload.';
      confirm.textContent='Delete for good';confirm.classList.add('danger');cancel.focus();
    };
    projectDeleteDialog.showModal();cancel.focus();
  });
}
document.addEventListener('keydown',event=>{if(projectDeleteDialog.open)event.stopImmediatePropagation();},true);
for(const type of ['drop','paste'])document.addEventListener(type,event=>{if(projectDeleteDialog.open){event.preventDefault();event.stopImmediatePropagation();}},true);
async function removeProjectData(id,saved){
  const db=await openPictureDatabase().catch(()=>null),key=projectStorage(id),listKey=projectListKey;
  if(db)await usePictureStore('readwrite',store=>{store.delete(key);store.put(saved,listKey);});
  try{
    localStorage.setItem(projectListKey,JSON.stringify(saved));localStorage.removeItem(projectStorage(id));localStorage.setItem(activeProjectKey,saved.active);
  }catch(error){if(!db)throw error;}
}
async function deleteProject(id){
  if(projectSwitchBusy||!localProjects.some(project=>project.id===id))return;
  if(imageEditSession){notify('Choose Done or Cancel before deleting a project.');return;}
  if(canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open||pictureDropBusy)return;
  let deleted=false,dialogShown=false;
  projectSwitchBusy=true;renderProjects();
  try{
    await projectsReady;
    await spaceClient?.ready;
    const project=localProjects.find(project=>project.id===id);
    if(!project||imageEditSession||canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open||pictureDropBusy)return;
    dialogShown=true;if(!await confirmProjectDeletion(project))return;
    if(spaceClient)await spaceClient.remove(id);
    const remaining=localProjects.filter(project=>project.id!==id),index=localProjects.indexOf(project);
    if(!remaining.length)remaining.push(blankProject());
    const nextId=id===activeProject?remaining[Math.min(index,remaining.length-1)].id:activeProject;
    const session=projectSessions.get(nextId),nextLayout=id===activeProject?(session?.state||remaining.find(project=>project.id===nextId).layout||await readProjectLayout(nextId)):null;
    await removeProjectData(id,projectListData(remaining,nextId,new Set([...deletedProjects,id])));
    deletedProjects.add(id);localProjects.splice(0,localProjects.length,...remaining);projectSessions.delete(id);
    if(id===activeProject)openProject(nextId,nextLayout,session);
    else saveProjectList();
    deleted=true;notify('Deleted “'+project.name+'”.');
  }catch{notify('Could not delete this project. Please try again.');}
  finally{
    if(projectDeleteDialog.open)projectDeleteDialog.close();
    projectSwitchBusy=false;renderProjects();
    if(deleted)document.querySelector('[data-project="'+activeProject+'"]')?.focus({preventScroll:true});
    else if(dialogShown)document.querySelector('[data-delete-project="'+id+'"]')?.focus({preventScroll:true});
  }
}
function exportProjects(doc){
  const projects=localProjects.map(project=>({...project,layout:project.id===activeProject?state:projectSessions.get(project.id)?.state||localProjectLayout(project.id)}));
  doc.querySelector('#initial-projects').textContent=JSON.stringify({version:1,active:activeProject,projects}).replace(/</g,'\\u003c');
}
function initializeProjects(){
  renderProjects();
  return (async()=>{
    await picturesReady;
    await inlineProjectVideos(state);
    for(const project of localProjects)if(project.layout)await inlineProjectVideos(project.layout);
    let saved;
    try{
      const key=projectListKey;
      saved=await usePictureStore('readonly',store=>store.get(key));
      restoreProjectList(saved);
    }catch{}
    if(!localProjects.length)localProjects.push(blankProject());
    for(const project of localProjects){
      if(project.id===activeProject)continue;
      const layout=await readProjectLayout(project.id);
      projectSessions.set(project.id,{state:layout,history:[],future:[],selected:[],view:null});
      try{localStorage.setItem(projectStorage(project.id),JSON.stringify(layout));}catch{}
      const key=projectStorage(project.id),savedLayout=copy(layout);
      usePictureStore('readwrite',store=>store.put(savedLayout,key)).catch(()=>{});
    }
    const restoredActive=[saved?.active,savedActiveProject,activeProject,localProjects[0].id].find(id=>localProjects.some(project=>project.id===id));
    if(restoredActive!==activeProject){
      if(localProjects.some(project=>project.id===activeProject)){save();keepProjectSession();}
      const session=projectSessions.get(restoredActive);openProject(restoredActive,session?.state||await readProjectLayout(restoredActive),session);
    }
    for(const id of deletedProjects){
      projectSessions.delete(id);
      try{localStorage.removeItem(projectStorage(id));}catch{}
      const key=projectStorage(id);
      usePictureStore('readwrite',store=>store.delete(key)).catch(()=>{});
    }
    saveProjectList();renderProjects();
    if(activeProject==='landing'&&!savedActiveProject){
      resetCanvasView();$('zoom').value='all';render();
    }
  })();
}
