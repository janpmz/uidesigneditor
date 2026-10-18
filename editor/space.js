// Space saves use HTTP. WebSockets only announce that a saved project changed.
(() => {
  const records=new Map(),pictures=new Map(),pictureIds=new Map();
  let applying=false,enabled=false,ws=null,reconnectTimer=null,saveTimer=null,saving=null,refreshing=null;
  let stopped=false,problem='',conflictId=null,starting=false,refreshAgain=false;
  const metadataKey=()=> 'ui-design-editor-space-versions-v1:'+onlineSpaceId;
  const snapshot=id=>JSON.stringify({name:localProjects.find(project=>project.id===id).name,layout:copy(id===activeProject?state:projectSessions.get(id)?.state||localProjectLayout(id))});
  const dirty=record=>record.local!==record.saved;
  const busy=()=>Boolean(drag||fieldEdit||imageEditSession||canvasViewBusy()||canvasPan||canvasPinch||projectSwitchBusy||pictureDropBusy||pictureChoice.open);

  spaceClient={changed,remove,ready:Promise.resolve(),flush,async saved(){
    if(!onlineSpaceId)return;
    if(!enabled)throw new Error('The Space is not open. Retry before saving.');
    await flush();
    if(records.get(activeProject)?.conflict)throw new Error('A newer version exists. Reload or save as a copy. Your edit stays in this browser.');
  },close(){stopped=true;clearTimeout(saveTimer);clearTimeout(reconnectTimer);ws?.close();showStatus();}};
  $('space-share').onclick=()=>run(async()=>{await navigator.clipboard.writeText(location.href);notify('Space link copied. Anyone with this link can edit.');});
  $('space-retry').onclick=()=>spaceClient.ready=run(async()=>{problem='';if(!onlineSpaceId)await createSpace();else if(!enabled)await start();else{await refresh();await flush();}if(!ws||ws.readyState===WebSocket.CLOSED)connect();});
  $('space-reload').onclick=()=>run(async()=>{
    if(busy())throw new Error('Finish the current edit first.');
    const id=conflictId,record=records.get(id);
    if(!record)return;
    // Reload is explicit; keep the current page in Undo when it still exists.
    await refreshProject(id,true);await refresh();showStatus();
  });
  $('space-copy').onclick=()=>run(async()=>{
    if(busy())throw new Error('Finish the current edit first.');
    const record=records.get(conflictId);
    const local=JSON.parse(record.local);
    createProject(local.layout,local.name+' (copy)');
    await refreshProject(conflictId,true);await flush();showStatus();
  });
  window.addEventListener('hashchange',()=>{if((location.hash||'')!==(onlineSpaceId?'#space='+onlineSpaceId:''))location.reload();});
  window.addEventListener('beforeunload',event=>{
    if(enabled&&[...records.values()].some(dirty)){event.preventDefault();event.returnValue='';}
  });
  if(location.protocol==='file:'){showStatus();$('space-help').textContent='This HTML file keeps its own projects. Open the site to share work through a Space.';return;}
  spaceClient.ready=run(onlineSpaceId?start:createSpace);

  async function start(){
    await projectsReady;
    setLoading(true);
    try{
      let metadata={};
      try{metadata=JSON.parse(localStorage.getItem(metadataKey())||'{}');}catch{}
      for(const project of localProjects){
        const saved=metadata[project.id];
        if(!saved)continue;
        const local=snapshot(project.id);
        records.set(project.id,{version:saved.version,local,saved:saved.dirty?null:local,conflict:false});
      }
      await refresh();enabled=true;problem='';rememberSpace();
      changed();connect();
    }finally{setLoading(false);}
  }

  async function createSpace(){
    await projectsReady;
    if(busy())throw new Error('Finish the current edit first.');
    const seeds=localProjects.map(project=>({id:project.id,...JSON.parse(snapshot(project.id))}));
    setLoading(true);
    try{
      const {spaceId}=await request('/api/spaces',{method:'POST'},null);
      const created=[];
      for(const project of seeds){
        const layout=await encodePictures(project.layout,spaceId,project.id);
        const result=await request('/api/projects/'+project.id,{method:'PUT',body:{name:project.name,layout,version:0}},spaceId);
        created.push({id:project.id,version:result.version});
      }
      onlineSpaceId=spaceId;
      activeProjectKey='ui-design-editor-active-project-v1:'+projectScope();
      projectListKey='ui-design-editor-projects-v1:'+projectScope();STORAGE=projectStorage(activeProject);
      window.history.replaceState(null,'','#space='+spaceId);
      rememberSpace();
      if(typeof updateCodexPromptUrl==='function')updateCodexPromptUrl();
      for(const project of created){const local=snapshot(project.id),seed=seeds.find(seed=>seed.id===project.id);records.set(project.id,{version:project.version,local,saved:JSON.stringify({name:seed.name,layout:seed.layout}),conflict:false});cacheProject(project.id,JSON.parse(local).layout);}
      enabled=true;saveMetadata();saveProjectList();problem='';connect();
    }finally{setLoading(false);}
  }

  function changed(){
    if(!enabled||applying||!onlineSpaceId||imageEditSession)return;
    const local=snapshot(activeProject);
    let record=records.get(activeProject);
    if(record?.local===local)return;
    if(!record){record={version:0,saved:null,local,conflict:false};records.set(activeProject,record);}
    record.local=local;saveMetadata();
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>run(async()=>{await refresh();await flush();}),160);
    showStatus();
  }

  async function flush(force=false){
    if(saving)return saving;
    if(!enabled||!onlineSpaceId)return;
    if(busy()&&!force){clearTimeout(saveTimer);saveTimer=setTimeout(()=>run(flush),160);return;}
    saving=(async()=>{
      for(const [id,record] of records){
        while(dirty(record)&&!record.conflict&&!record.deleting){
          const sent=record.local,project=JSON.parse(sent);
          record.saving=true;
          try{
            const layout=await encodePictures(project.layout,onlineSpaceId,id);
            const result=await request('/api/projects/'+id,{method:'PUT',body:{version:record.version,name:project.name,layout}});
            record.version=result.version;record.saved=sent;problem='';saveMetadata();
          }catch(error){if(error.status===409){record.conflict=true;saveMetadata();break;}throw error;}
          finally{record.saving=false;}
        }
      }
    })();
    try{await saving;}finally{saving=null;showStatus();}
    await refresh();
  }

  async function refresh(){
    if(refreshing){refreshAgain=true;return refreshing;}
    refreshing=(async()=>{
      do{
      refreshAgain=false;
      const {projects}=await request('/api/projects');
      // Freshly opened links start with the saved Space, not the sample pages.
      if(!enabled&&!records.size){applying=true;localProjects.splice(0);projectSessions.clear();applying=false;}
      for(const project of projects){
        const record=records.get(project.id);
        if(record?.saving||record?.deleting)continue;
        if(!record||project.version>record.version)await refreshProject(project.id,false,project);
      }
      if(!localProjects.length){
        applying=true;
        const blank=blankProject();localProjects.push(blank);openProject(blank.id,blank.layout);
        applying=false;
      }
      saveProjectList();renderProjects();
      }while(refreshAgain);
    })();
    try{await refreshing;}finally{refreshing=null;}
  }

  async function refreshProject(id,force=false,metadata=null){
    let record=records.get(id);
    const before=record?.local;
    if(record?.conflict&&!force)return;
    if(record&&dirty(record)&&!force){record.conflict=true;saveMetadata();showStatus();return;}
    if(busy()&&!starting){clearTimeout(saveTimer);saveTimer=setTimeout(()=>run(async()=>{await refresh();await flush();}),160);return;}
    if(metadata?.deleted){applyDeletion(id);return;}
    let remote;
    try{remote=await request('/api/projects/'+id);}
    catch(error){if(error.status===404){applyDeletion(id);return;}throw error;}
    const layout=await decodePictures(remote.layout,id);
    // An edit may have started while the page or pictures were loading.
    record=records.get(id);
    if(record&&record.local!==before){record.conflict=true;saveMetadata();showStatus();return;}
    if(record&&dirty(record)&&!force){record.conflict=true;saveMetadata();showStatus();return;}
    if(busy()&&!starting){clearTimeout(saveTimer);saveTimer=setTimeout(()=>run(refresh),160);return;}
    applying=true;
    try{
      let project=localProjects.find(project=>project.id===id);
      if(!project){project={id,name:remote.name,layout};localProjects.push(project);}
      project.name=remote.name;project.layout=copy(layout);deletedProjects.delete(id);
      const previous=projectSessions.get(id);
      if(id===activeProject){
        if(JSON.stringify(state)!==JSON.stringify(layout))remember();
        state=copy(layout);selected=new Set([...selected].filter(id=>layout.items.some(item=>item.id===id)));render();keepProjectSession();
      }else{
        if(previous&&JSON.stringify(previous.state)!==JSON.stringify(layout)){
          previous.history.push(JSON.stringify(previous.state));if(previous.history.length>80)previous.history.shift();previous.future=[];
        }
        projectSessions.set(id,{...(previous||{history:[],future:[],selected:[],view:null}),state:copy(layout)});
      }
      const local=JSON.stringify({name:remote.name,layout});
      records.set(id,{version:remote.version,saved:local,local,conflict:false});
      cacheProject(id,layout);saveMetadata();
      if(!localProjects.some(project=>project.id===activeProject))openProject(id,copy(layout),projectSessions.get(id));
    }finally{applying=false;}
    showStatus();
  }

  function applyDeletion(id){
    applying=true;
    try{
      const index=localProjects.findIndex(project=>project.id===id);
      if(index>=0)localProjects.splice(index,1);
      projectSessions.delete(id);records.delete(id);deletedProjects.add(id);
      if(id===activeProject&&localProjects.length){const next=localProjects[0];openProject(next.id,copy(next.layout||projectSessions.get(next.id).state),projectSessions.get(next.id));}
      saveMetadata();
    }finally{applying=false;}
  }

  async function remove(id){
    if(!enabled)return;
    await flush(true);
    const record=records.get(id);
    if(!record||record.conflict||dirty(record))throw new Error('A newer version exists. Reload before deleting.');
    record.deleting=true;
    try{
      await request('/api/projects/'+id,{method:'DELETE',body:{version:record.version}});
      records.delete(id);saveMetadata();
    }catch(error){record.deleting=false;if(error.status===409)record.conflict=true;throw error;}
  }

  function connect(){
    if(stopped||!onlineSpaceId||ws&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(ws.readyState))return;
    clearTimeout(reconnectTimer);
    ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws');
    ws.onopen=()=>{ws.send(JSON.stringify({type:'join_space',payload:{spaceId:onlineSpaceId}}));showStatus();};
    ws.onmessage=event=>run(async()=>{
      const {type,payload}=JSON.parse(event.data);
      if(type==='connected'){spaceClient.clientId=payload.clientId;problem='';await refresh();await flush();}
      else if(type==='project_changed'){await refresh();}
      showStatus();
    });
    ws.onclose=event=>{
      if(event.code===1008){problem='Space not found. Check the link.';stopped=true;}
      else if(!stopped)reconnectTimer=setTimeout(connect,3000);
      showStatus();
    };
    ws.onerror=()=>{problem='Connection lost';showStatus();};
    showStatus();
  }

  async function request(path,{method='GET',body}={},spaceId=onlineSpaceId){
    const response=await fetch(path,{method,headers:{...(spaceId?{Authorization:'Bearer '+spaceId}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.error||'Could not save.'),{status:response.status});
    return data;
  }

  async function encodePictures(source,spaceId,projectId){
    const layout=copy(source);
    for(const item of layout.items){
      if(item.kind==='image'){
        const key=spaceId+':'+projectId+':'+item.src;
        let id=pictureIds.get(key);
        if(!id){({id}=await request('/api/projects/'+projectId+'/pictures',{method:'POST',body:{src:item.src}},spaceId));pictureIds.set(key,id);pictures.set(spaceId+':'+projectId+':'+id,item.src);}
        item.src='picture:'+id;
      }
      if(item.imageContents)item.imageContents=await encodePictures(item.imageContents,spaceId,projectId);
    }
    return layout;
  }
  async function decodePictures(source,projectId){
    const layout=copy(source);
    for(const item of layout.items){
      if(item.kind==='image'){
        const id=item.src.slice(8),key=onlineSpaceId+':'+projectId+':'+id;
        if(!pictures.has(key)){const {src}=await request('/api/projects/'+projectId+'/pictures/'+id);pictures.set(key,src);pictureIds.set(onlineSpaceId+':'+projectId+':'+src,id);}
        item.src=pictures.get(key);
      }
      if(item.imageContents)item.imageContents=await decodePictures(item.imageContents,projectId);
    }
    return layout;
  }

  function cacheProject(id,layout){
    try{localStorage.setItem(projectStorage(id),JSON.stringify(layout));}catch{}
    if(pictureDB)pictureDB.transaction('drafts','readwrite').objectStore('drafts').put(copy(layout),projectStorage(id));
  }
  function saveMetadata(){
    try{localStorage.setItem(metadataKey(),JSON.stringify(Object.fromEntries([...records].map(([id,record])=>[id,{version:record.version,dirty:dirty(record)}]))));}catch{}
  }
  function showStatus(){
    const connection=$('space-connection');
    const connected=!stopped&&ws?.readyState===WebSocket.OPEN;
    connection.dataset.state=location.protocol==='file:'?'local':connected?'connected':stopped||problem&&!enabled?'disconnected':'connecting';
    connection.title=connection.dataset.state==='local'?'Local file':connected?'Connected':connection.dataset.state==='disconnected'?'Disconnected':spaceClient.clientId?'Reconnecting…':'Connecting…';
    connection.setAttribute('aria-label',connection.title);
    conflictId=[...records].find(([,record])=>record.conflict)?.[0]||null;
    $('space-share').hidden=!enabled;$('space-retry').hidden=!problem;
    $('space-help').hidden=Boolean(onlineSpaceId);
    $('space-conflict').hidden=!conflictId;
    if(conflictId)$('space-conflict-message').textContent='“'+(localProjects.find(p=>p.id===conflictId)?.name||'Project')+'”: A newer version exists. Reload or save as a copy.';
    $('space-status').textContent=problem||(starting?'Opening Space…':!onlineSpaceId?'Local projects':!enabled?'Could not open Space.':conflictId?'Space · Can’t save':saving||[...records.values()].some(dirty)?'Space · Saving…':ws?.readyState===WebSocket.OPEN?'Space · Saved':'Space · Reconnecting…');
  }
  function setLoading(value){
    starting=value;stage.inert=value;
    for(const id of ['editor-topbar','editor-layers','editor-inspector'])if($(id))$(id).inert=value;
    showStatus();
  }
  function rememberSpace(){try{localStorage.setItem(lastSpaceKey,onlineSpaceId);}catch{}}
  async function run(fn){
    try{await fn();}catch(error){problem=error.message;showStatus();notify(error.message);}
  }
})();
