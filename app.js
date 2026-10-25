(async () => {
  'use strict';
  const pigments = [
    ['Lemon','#d8ca65','PY 3'],['Gamboge','#c9a64f','PY 153'],['Ochre','#b28b51','PY 43'],['Sienna','#b7764b','PBr 7'],['Apricot','#d69d7c','PO 20'],['Vermilion','#bf614d','PR  verm'],
    ['Coral','#cf8279','PR 242'],['Rose','#b86576','PV 19'],['Madder','#954659','PR 83'],['Crimson','#792f45','PR 179'],['Mulberry','#74445b','PV 32'],['Aubergine','#513d50','PV 23'],
    ['Lilac','#a49aa9','PV 15'],['Wisteria','#837c9f','PV 16'],['Violet','#665e8e','PV 23'],['Ultramarine','#4d5b89','PB 29'],['Cobalt','#557f9e','PB 28'],['Cerulean','#6e9cae','PB 35'],
    ['Sky','#9abac0','PB 36'],['Prussian','#344f64','PB 27'],['Indigo','#35484d','PB 60'],['Petrol','#376c70','PB 15'],['Turquoise','#5e9691','PG 50'],['Sea glass','#8eafa3','PG 7'],
    ['Juniper','#42685d','PG 18'],['Viridian','#467b64','PG 18'],['Sage','#91a38a','PG 17'],['Olive','#7c8255','PG 8'],['Moss','#60694e','PG 23'],['Lichen','#b2b68a','PY 129'],
    ['Raw umber','#82705b','PBr 7'],['Burnt umber','#695044','PBr 7'],['Sepia','#4d443d','PBr  sep'],['Graphite','#484a45','PBk 9'],['Warm grey','#a7a296','PBk 6'],['Ivory','#ede3cd','PW 6']
  ];
  const $ = id => document.getElementById(id), canvas = $('paper');
  const W=1500,H=1100,TAU=Math.PI*2,KEY='ink-tide-bath-v3';
  const phone=matchMedia('(max-width:740px)'), reduced=matchMedia('(prefers-reduced-motion:reduce)');
  let portrait=phone.matches,touched=false,restoring=false,lastGood=null,history=[],chosen=24,tool='drop',entryToolChosen=false,sessionReady=false,gesture=null,growing=null,seed=8147,study=1,toastTimer;
  const metrics={renders:0,maxRenderMs:0,maxCombFrameMs:0,points:0,peakPoints:0,refinementLimited:false,cells:762960,mapPasses:0,dropFrames:0,combFrames:0,totalCombFrameMs:0,queuedSegments:0};
  const brushLoad={round:false,fan:false},brushColours={round:24,fan:24};const isBrush=t=>t==='round'||t==='fan';const inkColour=()=>[1,3,5].map(i=>parseInt(pigments[chosen][1].slice(i,i+2),16)/255);
  const frameSamples=[];let waves=[],wakes=[],waveFrame=null,surfaceTime=performance.now();
  window.inkTideDiagnostics={ready:()=>sessionReady,metrics:()=>({...metrics,frameSamples:frameSamples.slice(),mapPasses:bath.passes,precision:bath.packed?'packed16':'float32'}),surface:()=>({tool,brushLoad:{...brushLoad},waves:waves.map(w=>({...w,age:surfaceTime-w.start})),radius:growing?.currentRadius||0,wakes:wakes.length}),pending:()=>!!(growing||gesture||waves.length||wakes.length),resetMetrics:()=>{frameSamples.length=0;metrics.maxCombFrameMs=0;metrics.combFrames=0;metrics.queuedSegments=0;metrics.maxRenderMs=0;metrics.totalCombFrameMs=0;}};
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const grain={data:new Uint8Array(W*H*4)};
  for(let i=0;i<grain.data.length;i+=4){const n=(random()-.5)*18;grain.data[i]=129+n;grain.data[i+1]=123+n;grain.data[i+2]=106+n;grain.data[i+3]=13+random()*14;}
  let bath;try{bath=new InkBath(canvas,grain.data);}catch(error){console.error(error);notify('This browser could not open the drawing surface.');return;}
  const database=new Promise((resolve,reject)=>{const request=indexedDB.open(KEY,1);request.onupgradeneeded=()=>request.result.createObjectStore('paper');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  function render(){const start=performance.now();bath.display(portrait,waves.map(w=>[w.x,w.y,(surfaceTime-w.start)/1000,reduced.matches?0:w.amplitude]),(reduced.matches?[]:wakes.map(w=>[...w.line,(surfaceTime-w.start)/1000,w.width,w.kind,w.strength])));metrics.renders++;metrics.mapPasses=bath.passes;metrics.maxRenderMs=Math.max(metrics.maxRenderMs,performance.now()-start);canvas.dataset.motion=JSON.stringify(metrics);}
  function resize(){portrait=phone.matches;canvas.width=portrait?H:W;canvas.height=portrait?W:H;if(growing)placeArrival(growing.x,growing.y);if(hoverPoint)cursor(hoverPoint);render();}
  function snapshot(){lastGood={pixels:bath.read(),seed,study,waves:waves.map(w=>({...w,age:surfaceTime-w.start}))};return lastGood;}
  function remember(){history.push(snapshot());if(history.length>16)history.shift();$('undo').disabled=false;}
  let saveTimer=null;
  function saveNow(){clearTimeout(saveTimer);if(restoring)return;if(growing||gesture){persist();return;}const saved={...snapshot(),waves:[],chosen};database.then(db=>{const t=db.transaction('paper','readwrite');t.objectStore('paper').put(saved,'latest');}).catch(()=>{});}
  function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(growing||gesture){persist();return;}if(window.requestIdleCallback)requestIdleCallback(saveNow,{timeout:1000});else saveNow();},600);}
  function notify(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2000);}
  function animateSurface(now){
    waveFrame=null;surfaceTime=now;waves=waves.filter(w=>now-w.start<1350);wakes=wakes.filter(w=>now-w.start<550);render();
    if(waves.length||wakes.length)waveFrame=requestAnimationFrame(animateSurface);
  }
  function startSurface(){if(!waveFrame)waveFrame=requestAnimationFrame(animateSurface);}
  function clearSurface(){if(waveFrame)cancelAnimationFrame(waveFrame);waveFrame=null;waves=[];wakes=[];surfaceTime=performance.now();}
  function addWake(g,from,to){
    if(reduced.matches||g.cancelled||Math.hypot(to[0]-from[0],to[1]-from[1])<.1)return;
    const now=performance.now(),kind=g.tool==='comb'?0:g.tool==='round'?1:2,last=wakes.at(-1),line=[...from,...to];
    if(last&&last.kind===kind&&now-last.start<60&&Math.hypot(to[0]-last.line[0],to[1]-last.line[1])<90){last.line[2]=to[0];last.line[3]=to[1];}
    else{wakes=wakes.filter(w=>now-w.start<550).slice(-11);wakes.push({line,start:now,kind,width:kind===0?11:kind===1?10:26,strength:kind===0?.018:kind===1?.023:.015});}
    startSurface();
  }
  function clearWakes(){wakes=[];}
  function hideArrival(){$('drop-ghost').classList.remove('landing','forming');}
  function placeArrival(x,y){
    const r=canvas.getBoundingClientRect(),frame=canvas.parentElement.getBoundingClientRect();
    const u=portrait?1-y/H:x/W,v=portrait?x/W:y/H;
    $('drop-ghost').style.left=(r.left-frame.left-canvas.parentElement.clientLeft+u*r.width)+'px';$('drop-ghost').style.top=(r.top-frame.top-canvas.parentElement.clientTop+v*r.height)+'px';
  }
  function dropFrame(now){
    const a=growing;if(!a)return;surfaceTime=now;
    const elapsed=now-a.start-a.arrival,t=Math.min(1,Math.max(0,elapsed/a.duration));
    // Ease deposited area, not radius: fast contact spread followed by a short, quiet settling tail.
    const area=(1-Math.exp(-6*t))/(1-Math.exp(-6));a.currentRadius=a.radius*Math.sqrt(area);
    bath.drop(a.x,a.y,a.currentRadius,a.colour);metrics.dropFrames++;render();
    if(t<1)a.frame=requestAnimationFrame(dropFrame);else{growing=null;hideArrival();bath.commit();render();persist();}
  }
  function freezeDrop(){if(!growing)return;cancelAnimationFrame(growing.frame);if(!growing.currentRadius)waves=waves.filter(w=>w.start!==growing.start+growing.arrival);growing=null;hideArrival();bath.commit();render();persist();}
  function releaseDrop(x,y){
    freezeDrop();remember();const colour=[1,3,5].map(i=>parseInt(pigments[chosen][1].slice(i,i+2),16)/255),now=performance.now(),arrival=reduced.matches?0:90;
    growing={x,y,radius:118+random()*14,currentRadius:0,start:now,arrival,duration:reduced.matches?160:820,colour};
    if(!reduced.matches){waves=waves.filter(w=>now-w.start<1350);if(waves.length<4)waves.push({x,y,start:now+arrival,amplitude:5});startSurface();placeArrival(x,y);$('drop-ghost').classList.add('landing');}
    growing.frame=requestAnimationFrame(dropFrame);
  }
  function strokeStep(g,bx,by){
    const ax=g.applied[0],ay=g.applied[1],target=Math.atan2(by-ay,bx-ax);if(g.angle===null)g.angle=target;
    const old=g.angle,delta=Math.atan2(Math.sin(target-old),Math.cos(target-old));g.angle=old+Math.max(-Math.hypot(bx-ax,by-ay)*.002,Math.min(Math.hypot(bx-ax,by-ay)*.002,delta));
    const teeth=[];for(let i=-3;i<=3;i++){const offset=i*78;const a=ax-Math.sin(old)*offset,b=ay+Math.cos(old)*offset,c=bx-Math.sin(g.angle)*offset,d=by+Math.cos(g.angle)*offset,len=Math.hypot(c-a,d-b);if(len>1e-6)teeth.push([a,b,c,d,(c-a)/len,(d-b)/len,len*.90]);}
    if(isBrush(g.tool)){
      const n=g.tool==='round'?1:7,clean=[];
      for(let i=0;i<n;i++){const offset=n===1?0:(i-3)*8,weight=n===1?1.05:.40*(1-.12*Math.abs(i-3));
        const a=ax-Math.sin(old)*offset,b=ay+Math.cos(old)*offset,c=bx-Math.sin(g.angle)*offset,d=by+Math.cos(g.angle)*offset,len=Math.hypot(c-a,d-b);clean.push([a,b,c,d,(c-a)/Math.max(len,.001),(d-b)/Math.max(len,.001),len*weight]);}
      bath.step(clean,g.tool==='round'?[10,58]:[18,95]);
    }else bath.step(teeth,[46,260,1.12]);g.applied=[bx,by];
  }
  function queuePoint(g,p,flush=false){
    const a=g.raw||g.queuedLast,dx=p[0]-a[0],dy=p[1]-a[1],d=Math.hypot(dx,dy);let used=0,carry=g.carry||0,spacing=3;
    if(d>1e-6){while(d-used>=spacing-carry-1e-9){used+=spacing-carry;const q=[a[0]+dx*used/d,a[1]+dy*used/d];g.queue.push(q);g.queuedLast=q;carry=0;}g.carry=carry+d-used;g.raw=p;}
    if(flush&&Math.hypot(p[0]-g.queuedLast[0],p[1]-g.queuedLast[1])>1e-6){g.queue.push(p);g.queuedLast=p;g.carry=0;}
    metrics.queuedSegments=Math.max(metrics.queuedSegments,g.queue.length-g.index);
    if(g.index<g.queue.length&&!g.frame)g.frame=requestAnimationFrame(()=>combFrame(g));
  }
  function combFrame(g){
    if(gesture!==g)return;g.frame=null;const start=performance.now();if(g.index<g.queue.length&&!g.saved){remember();if(g.loaded)bath.beginPigmentStroke(g.colour);else bath.beginStroke();g.saved=true;g.paintSeed=seed;g.paintPhase=g.loaded?random()*TAU:0;g.paintTravel=0;g.paintCarry=0;g.lastWave=-Infinity;}
    const wakeFrom=g.applied.slice();let steps=0,paintedAt=null;while(g.index<g.queue.length&&steps<16){const p=g.queue[g.index++],distance=Math.hypot(p[0]-g.applied[0],p[1]-g.applied[1]);
      // The same bristle-liquid movement runs for loaded and clean strokes.
      strokeStep(g,p[0],p[1]);
      if(g.loaded){g.paintTravel+=distance;g.paintCarry+=distance;const spacing=g.tool==='round'?11:8;
        if(g.paintCarry>=spacing||(!g.moved&&steps===0)){g.paintCarry%=spacing;const a=g.angle||0,phase=g.paintPhase+g.paintTravel/43,wave=Math.sin(phase),drift=Math.sin(phase*.63)*1.5,drops=[];
          if(g.tool==='round')drops.push([p[0]-Math.sin(a)*drift,p[1]+Math.cos(a)*drift,7.2+wave*1.1]);
          else drops.push([p[0]-Math.sin(a)*drift,p[1]+Math.cos(a)*drift,8.1+wave*.8,4]);
          bath.deposit(drops,g.colour,a);paintedAt=p;
        }
      }steps++;}
    if(paintedAt){const now=performance.now();if(!reduced.matches&&now-g.lastWave>240&&waves.length<4){waves.push({x:paintedAt[0],y:paintedAt[1],start:now,amplitude:.65});g.lastWave=now;startSurface();}}
    if(steps){addWake(g,wakeFrom,g.applied);g.moved=true;bath.resolveStroke();metrics.combFrames++;render();}
    if(g.index<g.queue.length)g.frame=requestAnimationFrame(()=>combFrame(g));else{g.queue=[];g.index=0;if(g.released){bath.commit();gesture=null;$('comb-cursor').style.display='none';$('brush-cursor').style.display='none';$('tool-cursor').style.display='none';if(hoverPoint)cursor(hoverPoint);persist();}}
    const elapsed=performance.now()-start;if(steps)frameSamples.push(elapsed);metrics.totalCombFrameMs+=elapsed;metrics.maxCombFrameMs=Math.max(metrics.maxCombFrameMs,elapsed);
  }
  function updateBrush(){
    const brush=isBrush(tool);$('rinse').hidden=!brush;$('brush-state').hidden=!brush;
    if(brush){const loaded=brushLoad[tool];document.documentElement.style.setProperty('--brush-ink',loaded?pigments[brushColours[tool]][1]:'#b9a27e');$('brush-state').textContent=loaded?pigments[brushColours[tool]][0]:'Clean';$('rinse').title='Rinse '+tool+' brush';$('brush-cursor').dataset.shape=tool;$('brush-cursor').dataset.loaded=loaded;}
    for(const id of ['round','fan']){$(id).dataset.loaded=brushLoad[id];$(id).style.setProperty('--loaded-ink',pigments[brushColours[id]][1]);$(id).title=(id==='round'?'Round':'Fan')+' brush · '+(brushLoad[id]?pigments[brushColours[id]][0]:'clean');}
  }
  function mode(next){stopMotion();tool=next;if(isBrush(next)&&brushLoad[next]){chosen=brushColours[next];document.documentElement.style.setProperty('--ink',pigments[chosen][1]);$('pigment-name').textContent=pigments[chosen][0];$('pigment-code').textContent=pigments[chosen][2];document.querySelectorAll('.well').forEach((b,j)=>b.setAttribute('aria-pressed',j===chosen));}for(const id of ['drop','comb','round','fan'])$(id).setAttribute('aria-pressed',id===next);updateBrush();if(hoverPoint)cursor(hoverPoint);$('hint').textContent=next==='drop'?'Touch the surface to release '+pigments[chosen][0].toLowerCase()+'.':isBrush(next)?(brushLoad[next]?'Brush with '+pigments[chosen][0].toLowerCase()+'.':'Clean brush moves the floating colour. Dip in pigment to load.'):'Draw through the pigment.';}
  function choose(i,animate=true,changeTool=true){chosen=i;document.documentElement.style.setProperty('--ink',pigments[i][1]);$('pigment-name').textContent=pigments[i][0];$('pigment-code').textContent=pigments[i][2];document.querySelectorAll('.well').forEach((b,j)=>b.setAttribute('aria-pressed',i===j));const b=$('wells').children[i];b.classList.remove('ripple');if(animate){void b.offsetWidth;b.classList.add('ripple');setTimeout(()=>b.classList.remove('ripple'),550);}if(changeTool){if(isBrush(tool)){brushLoad[tool]=true;brushColours[tool]=i;}mode(isBrush(tool)?tool:'drop');}else updateBrush();setPalette(false);}
  function setPalette(open){document.body.classList.toggle('palette-open',open);$('palette-toggle').setAttribute('aria-expanded',open);}
  pigments.forEach(([name,color,code],i)=>{const b=document.createElement('button');b.className='well';b.style.setProperty('--pigment',color);b.title=name+' · '+code;b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',i===chosen);b.dataset.pigment=i;b.addEventListener('click',()=>{touched=true;choose(i);});$('wells').appendChild(b);});
  const point=e=>{const r=canvas.getBoundingClientRect(),u=(e.clientX-r.left)/r.width,v=(e.clientY-r.top)/r.height;return portrait?[v*W,(1-u)*H]:[u*W,v*H];};
  const pipetteShape=`<ellipse cx="0" cy="-205" rx="27" ry="36" fill="#625f50" stroke="#514f43"/><rect x="-12" y="-174" width="24" height="18" rx="4" fill="#8b8979"/><path d="M-7-156H7V-25L2 0H-2L-7-25Z" fill="#e6f2e777" stroke="#8da59a"/><path d="M-4-140H4V-26L0-8-4-26Z" fill="var(--ink)"/><path d="M-14-222q-6 8-5 18M-4-148v112" stroke="#fff7" fill="none" stroke-width="2"/>`;
  const cursorShapes={
    drop:pipetteShape,
    round:`<path d="M-9-242Q0-259 9-242l-3 192H-6Z" fill="#ab8961" stroke="#796346"/><path d="M-7-65H7v32H-7Z" fill="#b8b8a7" stroke="#92998b"/><path d="M-6-33Q-10-14 0 0Q10-14 6-33Z" fill="var(--brush-ink)" stroke="#806b4e"/><path d="M-3-30 0-4M3-29 1-8" stroke="#f4e9cc88" fill="none" stroke-width="1.5"/>`,
    fan:`<path d="M-9-242Q0-258 9-242l5 168H-14Z" fill="#ab8961" stroke="#796346"/><path d="M-16-85H16v30H-16Z" fill="#b8b8a7" stroke="#92998b"/><path d="M-12-55-30-5Q0 5 30-5L12-55Z" fill="var(--brush-ink)" stroke="#806b4e"/><path d="M-24-4-9-51M-16-2-6-53M-8-1-3-54M0 0v-53M8-1 3-54M16-2 6-53M24-4 9-51" stroke="#f4e9cc88" fill="none" stroke-width="1.5"/>`,
    comb:`<rect x="-248" y="-39" width="496" height="18" rx="4" fill="#bda17c" stroke="#806b4e"/><path d="M-234-21V0M-156-21V0M-78-21V0M0-21V0M78-21V0M156-21V0M234-21V0" stroke="#72796b" fill="none" stroke-width="3"/>`
  };
  $('palette-pipette').innerHTML=pipetteShape;
  let hoverPoint=null;
  function cursor(e,g=null){
    const r=canvas.getBoundingClientRect(),frame=canvas.parentElement.getBoundingClientRect(),node=$('tool-cursor');
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){node.style.display='none';return;}
    const kind=g?.tool||tool,scale=r.width/canvas.width,rotation=g?.angle!=null?(g.angle+(portrait?Math.PI/2:0)-Math.PI/2)*180/Math.PI:0;
    if(node.dataset.tool!==kind){node.innerHTML='<svg viewBox="-270 -270 540 540">'+cursorShapes[kind]+'<circle cx="0" cy="0" r="4" fill="#f6efdf" stroke="#506658" stroke-width="2"/></svg>';node.dataset.tool=kind;}
    node.style.width=540*scale+'px';node.style.height=540*scale+'px';node.style.left=e.clientX-frame.left-canvas.parentElement.clientLeft+'px';node.style.top=e.clientY-frame.top-canvas.parentElement.clientTop+'px';node.style.transform='translate(-50%,-50%) rotate('+rotation+'deg)';node.style.display='block';
    $('drop-ghost').style.left=e.clientX-frame.left-canvas.parentElement.clientLeft+'px';$('drop-ghost').style.top=e.clientY-frame.top-canvas.parentElement.clientTop+'px';$('drop-ghost').style.width=18*scale+'px';$('drop-ghost').style.height=30*scale+'px';
  }
  canvas.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hoverPoint={clientX:e.clientX,clientY:e.clientY};cursor(e);}});
  canvas.addEventListener('pointerleave',()=>{hoverPoint=null;$('tool-cursor').style.display='none';});
  function stopMotion(){clearWakes();freezeDrop();if(gesture){const g=gesture;if(g.frame)cancelAnimationFrame(g.frame);gesture=null;if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);$('drop-ghost').classList.remove('forming');$('comb-cursor').style.display='none';$('brush-cursor').style.display='none';$('tool-cursor').style.display='none';bath.commit();render();persist();}}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||restoring)return;touched=true;if(gesture&&!gesture.released)return;stopMotion();e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=point(e);
    gesture={id:e.pointerId,tool,start:p,applied:p,queuedLast:p,queue:[],index:0,angle:null,moved:false,saved:false,released:false,frame:null,loaded:isBrush(tool)&&brushLoad[tool],colour:inkColour()};cursor(e,gesture);
  });
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')hoverPoint={clientX:e.clientX,clientY:e.clientY};const g=gesture;if(!g||g.id!==e.pointerId||g.released){if(e.pointerType==='mouse')cursor(e);return;}if(g.tool!=='drop'){const events=e.getCoalescedEvents?.();for(const event of events?.length?events:[e])queuePoint(g,point(event));}cursor(e,g);});
  function finish(e,cancel=false){
    const g=gesture;if(!g||g.id!==e.pointerId)return;if(cancel){g.cancelled=true;clearWakes();render();}$('drop-ghost').classList.remove('forming');
    if(g.tool==='drop'){gesture=null;if(!cancel){const p=point(e);releaseDrop(p[0],p[1]);}else persist();}
    else{if(!cancel&&g.loaded&&!g.queue.length&&!g.saved){g.queue.push(point(e));}if(!cancel&&Number.isFinite(e.clientX))queuePoint(g,point(e),true);g.released=true;if(!g.frame)combFrame(g);}
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(e.pointerType!=='mouse')$('tool-cursor').style.display='none';else if(g.tool==='drop'){$('tool-cursor').style.display='none';setTimeout(()=>{if(tool==='drop'&&hoverPoint)cursor(hoverPoint);},170);}else if(hoverPoint)cursor(hoverPoint);
  }
  canvas.addEventListener('pointerup',e=>finish(e));canvas.addEventListener('pointercancel',e=>finish(e,true));canvas.addEventListener('lostpointercapture',e=>{if(gesture&&!gesture.released)finish(e,true);});
  window.addEventListener('blur',()=>{stopMotion();});window.addEventListener('pagehide',()=>{stopMotion();saveNow();});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopMotion();saveNow();}});
  phone.addEventListener('change',()=>{stopMotion();resize();});
  for(const id of ['drop','comb','round','fan'])$(id).onclick=()=>{entryToolChosen=true;mode(id);};$('rinse').onclick=()=>{stopMotion();if(isBrush(tool)){brushLoad[tool]=false;mode(tool);$('rinse').classList.remove('rinsing');void $('rinse').offsetWidth;$('rinse').classList.add('rinsing');setTimeout(()=>$('rinse').classList.remove('rinsing'),600);notify('Brush rinsed.');}};$('palette-toggle').onclick=()=>setPalette(!document.body.classList.contains('palette-open'));$('close-palette').onclick=()=>setPalette(false);
  function undo(){if(restoring)return;if(growing){cancelAnimationFrame(growing.frame);growing=null;}if(gesture){const g=gesture;if(g.frame)cancelAnimationFrame(g.frame);gesture=null;if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);}hideArrival();$('comb-cursor').style.display='none';$('brush-cursor').style.display='none';$('tool-cursor').style.display='none';clearSurface();const previous=history.pop();if(!previous)return;bath.upload(previous.pixels);surfaceTime=performance.now();waves=(previous.waves||[]).map(w=>({...w,start:surfaceTime-w.age}));if(waves.length)startSurface();seed=previous.seed;study=previous.study;lastGood=previous;$('study').textContent=String(study).padStart(2,'0');$('undo').disabled=!history.length;render();persist();}
  $('undo').onclick=undo;$('new').onclick=()=>{if(restoring)return;touched=true;stopMotion();remember();clearSurface();bath.blank();study++;$('study').textContent=String(study).padStart(2,'0');entryToolChosen=false;mode('drop');render();persist();};
  $('save').onclick=()=>{if(restoring)return;stopMotion();render();canvas.toBlob(blob=>{if(!blob){notify('Please try saving again.');return;}const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='ink-tide-study-'+String(study).padStart(2,'0')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('Saved as PNG.');},'image/png');};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setPalette(false);if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}if(!e.metaKey&&!e.ctrlKey){if(e.key.toLowerCase()==='d'){entryToolChosen=true;mode('drop');}if(e.key.toLowerCase()==='c'){entryToolChosen=true;mode('comb');}}});
  window.addEventListener('pageshow',event=>{
    if(!event.persisted||restoring||gesture||growing)return;
    const pixels=bath.read();
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==238||pixels[i+1]!==231||pixels[i+2]!==215)return;
    entryToolChosen=false;mode('drop');
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();restoring=true;clearTimeout(saveTimer);const active=!!(growing||gesture?.saved);clearSurface();if(growing)cancelAnimationFrame(growing.frame);if(gesture?.frame)cancelAnimationFrame(gesture.frame);growing=null;gesture=null;if(active&&history.at(-1)===lastGood)history.pop();$('drop-ghost').classList.remove('forming');$('comb-cursor').style.display='none';$('brush-cursor').style.display='none';$('tool-cursor').style.display='none';notify('Restoring your paper…');});
  canvas.addEventListener('webglcontextrestored',()=>{try{bath=new InkBath(canvas,grain.data);if(lastGood){bath.upload(lastGood.pixels);seed=lastGood.seed;study=lastGood.study;}restoring=false;$('undo').disabled=!history.length;render();persist();notify('Paper restored.');}catch(error){console.error(error);notify('Please reload to recover the saved paper.');}});
  choose(chosen,false);mode('drop');resize();lastGood=snapshot();
  try{const db=await database,saved=await new Promise((resolve,reject)=>{const r=db.transaction('paper').objectStore('paper').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(saved&&!touched&&saved.pixels?.length===bath.width*bath.height*4){bath.upload(new Uint8Array(saved.pixels));seed=saved.seed>>>0;study=saved.study||1;chosen=Math.max(0,Math.min(35,saved.chosen||0));choose(chosen,false,false);if(!entryToolChosen)mode('drop');$('study').textContent=String(study).padStart(2,'0');lastGood=snapshot();render();}}catch{}
  sessionReady=true;
})();
