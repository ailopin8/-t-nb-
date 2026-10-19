import * as THREE from 'three';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import {ControllerMenu} from './controller-menu';
import {createLabActions} from './lab-actions';
import type {MenuCategory} from './controller-menu';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

type VrEditor = {
  getIds: () => number[]; selected: () => number|null; select: (id:number) => string;
  create: () => string; cyclePrimary: () => string; addAlgorithm: () => string;
  removeAlgorithm: () => string; cycleOutput: () => string;
  beginConnection: () => string; finishConnection: () => string;
  toggleConnection: () => string; deleteSelected: () => string; loadExample: () => string;
};
type SpatialOptions = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  controls: OrbitControls; content: THREE.Group; getSummary: () => string;
  isRunning: () => boolean; pause: () => void; toggleRun: () => void;
  step: () => void; clearWorkspace: () => void; vr: VrEditor;
};
type XRSource = {handedness?: string; gamepad?: {
  axes: readonly number[]; buttons: readonly {pressed:boolean}[];
}};
type Tracked = {
  pointer: THREE.Group; grip: THREE.Group; source:XRSource|null;
  ray: THREE.Line; buttons: boolean[]; grabbing: boolean; side: string;
};
const bound=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const deadzone=(v:number|undefined)=>!Number.isFinite(v)||Math.abs(v??0)<.17?0:bound(v??0,-1,1);
const stick=(src:XRSource|null):[number,number]=>{
  const axes=src?.gamepad?.axes;if(!axes)return [0,0];
  return [deadzone(axes.length>=4?axes[2]:axes[0]),deadzone(axes.length>=4?axes[3]:axes[1])];
};

export function installSpatialControls(o:SpatialOptions):(now:number)=>void {
  const {renderer,scene,camera,controls,content}=o;
  const holder=document.querySelector<HTMLElement>('.spatial-section');
  if(!holder)throw Error('Missing spatial view');
  const access=document.createElement('div');access.className='viewer-access';
  access.innerHTML='<div class="camera-controls" role="group" aria-label="Desktop camera controls">'
    +['left','right','up','down','in','out','reset'].map(k=>'<button type="button" data-camera="'+k+'">'+(k==='reset'?'Recenter':k==='in'?'Zoom in':k==='out'?'Zoom out':'Orbit '+k)+'</button>').join('')
    +'<button type="button" id="describe-scene">Describe current state</button></div>'
    +'<p id="camera-help">Arrow keys orbit. + and − zoom. Home recenters. In Quest 3S VR, X/A toggles a hand-local tool menu, trigger selects, grip moves space, both grips rotate and resize space, and thumbsticks translate, rotate and scale.</p>'
    +'<p id="scene-description" role="status"></p><p id="spatial-feedback" role="status" aria-live="polite"></p>'
    +'<details><summary>Quest 3S VR controls</summary><p id="xr-availability">Checking immersive support…</p>'
    +'<p>The sandbox environments are the only persistent scene content. X/A or thumbstick click opens an on-demand controller-local action menu. Trigger points and selects a sandbox or menu button. Left/right grip physically pulls the sandbox space; two grips scale and rotate it. Left stick moves the space. Right stick rotates and scales it. B/Y returns from menus. The Meta system button is reserved. Controller availability is feature-detected.</p></details>';
  holder.append(access);
  const announce=(message:string)=>{access.querySelector<HTMLElement>('#spatial-feedback')!.textContent=message;};
  const available=access.querySelector<HTMLElement>('#xr-availability')!;
  const description=access.querySelector<HTMLElement>('#scene-description')!;
  const canvas=renderer.domElement;
  canvas.tabIndex=0;canvas.setAttribute('role','group');
  canvas.setAttribute('aria-label','3D algorithmically generated patterns in manipulable empty environments');
  canvas.setAttribute('aria-describedby','camera-help scene-description');
  document.getElementById('enter-vr')?.setAttribute('aria-describedby','xr-availability');
  const oldCamera=camera.position.clone(),oldTarget=controls.target.clone();
  const space=new THREE.Group();space.name='sandbox-space';
  scene.remove(content);space.add(content);scene.add(space);
  const zero=new THREE.Vector3();
  const headset=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3();
  let recenterPending=false,frames=0,previousFrame=0;

  function cameraAction(action:string) {
    if(renderer.xr.isPresenting){
      if(action==='reset'){recenterPending=true;announce('Recenter requested.');return;}
      if(action==='left')space.rotation.y+=.2;
      if(action==='right')space.rotation.y-=.2;
      if(action==='up')space.position.y+=.15;
      if(action==='down')space.position.y-=.15;
      if(action==='in')space.scale.setScalar(bound(space.scale.x*1.18,.22,2.8));
      if(action==='out')space.scale.setScalar(bound(space.scale.x/1.18,.22,2.8));
      return;
    }
    if(action==='reset'){camera.position.copy(oldCamera);controls.target.copy(oldTarget);controls.update();return;}
    const sph=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if(action==='left')sph.theta-=.18;
    if(action==='right')sph.theta+=.18;
    if(action==='up')sph.phi-=.12;
    if(action==='down')sph.phi+=.12;
    if(action==='in')sph.radius*=.85;
    if(action==='out')sph.radius*=1.15;
    sph.radius=bound(sph.radius,1.2,20);sph.phi=bound(sph.phi,.15,Math.PI-.15);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));controls.update();
  }
  access.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-camera]');
    if(button)cameraAction(button.dataset.camera!);
  });
  const keys:Record<string,string>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',Home:'reset'};
  canvas.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||!keys[event.key])return;
    event.preventDefault();cameraAction(keys[event.key]);
  });
  access.querySelector('#describe-scene')?.addEventListener('click',()=>{
    description.textContent=o.getSummary();announce('Current pattern state described.');
  });

  const pauseAll=()=>{o.pause();document.dispatchEvent(new CustomEvent('atunbi:pause-all'));};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAll();});
  const common=createLabActions({camera:cameraAction,summary:o.getSummary,pauseAll,clearWorkspace:o.clearWorkspace});
  const custom:MenuCategory[]=[
    {id:'spatial-tools',label:'Space and transport',description:'All operations use tracked controllers in VR.',actions:[
      {id:'vr-run',label:'Run / pause',run:()=>{o.toggleRun();return o.isRunning()?'Running.':'Paused.';}},
      {id:'vr-step',label:'Step one tick',run:()=>{o.step();return 'Advanced one tick.';}},
      {id:'vr-reset-view',label:'Recenter sandboxes',run:()=>{cameraAction('reset');return 'Recentering space.';}},
      {id:'vr-scale-up',label:'Enlarge space',run:()=>{space.scale.setScalar(bound(space.scale.x*1.18,.22,2.8));return 'Space enlarged.';}},
      {id:'vr-scale-down',label:'Shrink space',run:()=>{space.scale.setScalar(bound(space.scale.x/1.18,.22,2.8));return 'Space shrunk.';}},
      {id:'vr-left',label:'Rotate left',run:()=>{space.rotation.y+=.25;return 'Space rotated left.';}},
      {id:'vr-right',label:'Rotate right',run:()=>{space.rotation.y-=.25;return 'Space rotated right.';}},
      {id:'vr-pause',label:'Pause all',run:()=>{pauseAll();return 'All laboratories paused.';}}
    ]},
    {id:'sandbox-tools',label:'Sandbox node editor',description:'Select an environment with a trigger ray. Edit the selected environment.',actions:[
      {id:'vr-add-env',label:'Add empty sandbox',run:()=>o.vr.create()},
      {id:'vr-next-env',label:'Select next sandbox',available:()=>o.vr.getIds().length?null:'Add an environment first.',run:()=>{
        const ids=o.vr.getIds(),i=ids.indexOf(o.vr.selected()??-1);return o.vr.select(ids[(i+1)%ids.length]);
      }},
      {id:'vr-primary',label:'Change primary algorithm',available:()=>o.vr.selected()!=null?null:'Select an environment first.',run:()=>o.vr.cyclePrimary()},
      {id:'vr-add-layer',label:'Install algorithm',available:()=>o.vr.selected()!=null?null:'Select an environment first.',run:()=>o.vr.addAlgorithm()},
      {id:'vr-remove-layer',label:'Remove last algorithm',available:()=>o.vr.selected()!=null?null:'Select an environment first.',run:()=>o.vr.removeAlgorithm()},
      {id:'vr-next-output',label:'Next pattern output',available:()=>o.vr.selected()!=null?null:'Select an environment first.',run:()=>o.vr.cycleOutput()},
      {id:'vr-link-from',label:'Arm source connection',available:()=>o.vr.selected()!=null?null:'Select a source first.',run:()=>o.vr.beginConnection()},
      {id:'vr-link-to',label:'Connect into selected',available:()=>o.vr.selected()!=null?null:'Select a target first.',run:()=>o.vr.finishConnection()},
      {id:'vr-link-toggle',label:'Toggle input link',available:()=>o.vr.selected()!=null?null:'Select an environment first.',run:()=>o.vr.toggleConnection()},
      {id:'vr-example',label:'Load example',confirm:'Replace existing workspace with the example?',run:()=>o.vr.loadExample()},
      {id:'vr-delete',label:'Delete selected sandbox',confirm:'Delete the selected environment and attached relationships?',available:()=>o.vr.selected()!=null?null:'Select an environment first.',run:()=>o.vr.deleteSelected()}
    ]}
  ];
  const desktopMenu=new ControllerMenu([...custom,...common]);
  const xrMenu=new ControllerMenu([...custom,...common],'xr');
  const desktop=document.createElement('section');desktop.id='controller-menu';desktop.className='controller-menu';
  desktop.innerHTML='<h3>Controller menu</h3><p>VR displays this only on request, near a hand. Desktop controls remain available here.</p>'
    +'<h4 id="controller-category"></h4><div id="controller-actions" class="controller-actions"></div>'
    +'<div class="controller-pagination"><button type="button" data-menu="back">Back</button><button type="button" data-menu="previous">Previous</button>'
    +'<span id="controller-page"></span><button type="button" data-menu="next">Next</button></div>'
    +'<p id="controller-feedback" role="status" aria-live="polite"></p>';
  access.append(desktop);
  let desktopSignature='';
  function renderDesktop(){
    const entries=desktopMenu.entries;
    const signature=JSON.stringify([desktopMenu.title,desktopMenu.page,entries,desktopMenu.message]);
    if(signature===desktopSignature)return;desktopSignature=signature;
    desktop.querySelector<HTMLElement>('#controller-category')!.textContent=desktopMenu.title;
    desktop.querySelector<HTMLElement>('#controller-feedback')!.textContent=desktopMenu.message;
    desktop.querySelector<HTMLElement>('#controller-page')!.textContent='Page '+(desktopMenu.page+1)+' of '+desktopMenu.pageCount;
    const list=desktop.querySelector<HTMLElement>('#controller-actions')!;
    list.replaceChildren();
    for(const entry of entries){
      const div=document.createElement('div'),button=document.createElement('button');
      button.type='button';button.dataset.menu=entry.id;button.textContent=entry.label;button.disabled=!entry.enabled;div.append(button);
      if(entry.reason){const small=document.createElement('small');small.textContent=entry.reason;div.append(small);}
      list.append(div);
    }
    for(const id of ['next','previous']){
      const button=desktop.querySelector<HTMLButtonElement>('[data-menu="'+id+'"]')!;
      button.disabled=desktopMenu.pageCount<2;
    }
    desktop.querySelector<HTMLButtonElement>('[data-menu="back"]')!.disabled=!desktopMenu.category&&!desktopMenu.pending;
  }
  desktop.addEventListener('click',e=>{
    const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-menu]');
    if(!b)return;desktopMenu.activate(b.dataset.menu!);renderDesktop();
  });
  desktop.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();desktopMenu.back();renderDesktop();}
  });
  renderDesktop();

  // Controller-mounted ephemeral tool palette, NOT a permanent front panel.
  const palette=new THREE.Group();palette.name='xr-ephemeral-controller-tools';palette.visible=false;scene.add(palette);
  const targets:THREE.Mesh[]=[];
  const contexts:CanvasRenderingContext2D[]=[];
  for(let i=0;i<9;i++){
    const c=document.createElement('canvas');c.width=512;c.height=128;
    const ctx=c.getContext('2d')!;contexts.push(ctx);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(i<6?.49:.30,.15),
      new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    mesh.position.set(i<6?(i%2===0?-.265:.265):(i-7)*.325,i<6?-.10-Math.floor(i/2)*.175:-.67,0);
    palette.add(mesh);targets.push(mesh);
  }
  const statusCanvas=document.createElement('canvas');statusCanvas.width=1024;statusCanvas.height=220;
  const statusCtx=statusCanvas.getContext('2d')!;
  const statusTex=new THREE.CanvasTexture(statusCanvas);statusTex.colorSpace=THREE.SRGBColorSpace;
  const statusMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.24),
    new THREE.MeshBasicMaterial({map:statusTex,side:THREE.DoubleSide}));
  statusMesh.position.set(0,.20,0);palette.add(statusMesh);
  let xrSignature='';
  function renderPalette(){
    if(!palette.visible)return;
    const entries=xrMenu.entries;
    const buttons=[...entries,...Array.from({length:Math.max(0,6-entries.length)},()=>null),
      {id:'back',label:'Back / cancel',enabled:!!xrMenu.category||!!xrMenu.pending,reason:null},
      {id:'previous',label:'Previous',enabled:xrMenu.pageCount>1,reason:null},
      {id:'next',label:'Next',enabled:xrMenu.pageCount>1,reason:null}
    ];
    const signature=JSON.stringify([xrMenu.title,xrMenu.page,xrMenu.selected,xrMenu.message,buttons,o.vr.selected()]);
    if(signature===xrSignature)return;xrSignature=signature;
    buttons.forEach((entry,i)=>{
      const mesh=targets[i];mesh.visible=!!entry;
      mesh.userData.menu=entry?.id;mesh.userData.enabled=entry?.enabled;
      const ctx=contexts[i];ctx.fillStyle=entry?.enabled?(i===xrMenu.selected?'#285e7c':'#102e45'):'#253240';
      ctx.fillRect(0,0,512,128);
      ctx.strokeStyle=i===xrMenu.selected?'#fff':'#84ccee';ctx.lineWidth=i===xrMenu.selected?9:4;ctx.strokeRect(5,5,502,118);
      ctx.fillStyle=entry?.enabled?'#fff':'#afbac5';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold 29px sans-serif';ctx.fillText(entry?.label??'',256,64,475);
      (mesh.material as THREE.MeshBasicMaterial).map!.needsUpdate=true;
    });
    statusCtx.fillStyle='#102b45';statusCtx.fillRect(0,0,1024,220);
    statusCtx.textAlign='center';statusCtx.fillStyle='#fff';statusCtx.font='bold 46px sans-serif';
    statusCtx.fillText(xrMenu.title+' · '+(xrMenu.page+1)+'/'+xrMenu.pageCount,512,60,1000);
    statusCtx.fillStyle='#a5e4ff';statusCtx.font='28px sans-serif';
    statusCtx.fillText('Selected sandbox '+(o.vr.selected()??'none'),512,112,980);
    statusCtx.fillStyle='#e9c891';statusCtx.font='26px sans-serif';
    statusCtx.fillText(xrMenu.message.slice(0,70),512,170,990);
    statusTex.needsUpdate=true;
  }

  const raycaster=new THREE.Raycaster();
  const orientation=new THREE.Matrix4();
  const makeRay=(controller:THREE.Group)=>{
    controller.updateWorldMatrix(true,false);
    orientation.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0,0,-1).applyMatrix4(orientation).normalize();
  };
  const hitMenu=(controller:THREE.Group)=>{
    if(!palette.visible)return undefined;
    palette.updateWorldMatrix(true,true);makeRay(controller);
    return raycaster.intersectObjects(targets.filter(t=>t.visible),false)[0];
  };
  const hitSpace=(controller:THREE.Group)=>{
    space.updateWorldMatrix(true,true);makeRay(controller);
    return raycaster.intersectObjects(content.children.filter(x=>x.userData.sandboxHitbox===true),false)[0];
  };
  const modelFactory=new XRControllerModelFactory();
  const tracked:Tracked[]=[];
  const poses=[new THREE.Vector3(),new THREE.Vector3()];
  const gripAt=new THREE.Vector3(),spaceAt=new THREE.Vector3(),midAt=new THREE.Vector3();
  let spanAt=1,turnAt=0,yawAt=0,scaleAt=.58,singleIndex=0;
  let grabMode:'none'|'one'|'two'='none';
  function gripPosition(i:number){
    tracked[i].grip.updateWorldMatrix(true,false);
    return tracked[i].grip.getWorldPosition(poses[i]);
  }
  function captureGrab(){
    const held=tracked.map((t,i)=>t.grabbing?i:-1).filter(i=>i>=0);
    if(!held.length){grabMode='none';return;}
    spaceAt.copy(space.position);
    if(held.length===1){
      grabMode='one';singleIndex=held[0];gripAt.copy(gripPosition(singleIndex));return;
    }
    grabMode='two';
    const a=gripPosition(0),b=gripPosition(1);
    midAt.copy(a).add(b).multiplyScalar(.5);
    spanAt=Math.max(.06,a.distanceTo(b));
    turnAt=Math.atan2(b.x-a.x,b.z-a.z);yawAt=space.rotation.y;scaleAt=space.scale.x;
  }
  function updateGrab(){
    if(grabMode==='one'){
      space.position.copy(spaceAt).add(gripPosition(singleIndex)).sub(gripAt);
      return true;
    }
    if(grabMode==='two'){
      const a=gripPosition(0),b=gripPosition(1);
      const middle=a.clone().add(b).multiplyScalar(.5);
      space.position.copy(spaceAt).add(middle).sub(midAt);
      space.scale.setScalar(bound(scaleAt*a.distanceTo(b)/spanAt,.22,2.8));
      let angle=Math.atan2(b.x-a.x,b.z-a.z)-turnAt;
      if(angle>Math.PI)angle-=Math.PI*2;
      if(angle<-Math.PI)angle+=Math.PI*2;
      space.rotation.y=yawAt+angle;return true;
    }
    return false;
  }
  function showMenu(force?:boolean){
    palette.visible=force??!palette.visible;
    if(palette.visible){xrMenu.back();announce('Controller tools opened.');}
    else announce('Tools hidden. Only sandboxes are visible.');
    xrSignature='';renderPalette();
  }
  function selectFromRay(controller:THREE.Group){
    if(!renderer.xr.isPresenting)return;
    if(palette.visible){
      const hit=hitMenu(controller);
      if(hit?.object.userData.enabled)xrMenu.activate(String(hit.object.userData.menu));
      else if(navUsed){const entry=xrMenu.entries[xrMenu.selected];if(entry)xrMenu.activate(entry.id);}
      renderPalette();announce(xrMenu.message);return;
    }
    const target=hitSpace(controller);
    const id=target?.object.userData.sandboxId as number|undefined;
    if(id!==undefined)announce(o.vr.select(id));
  }
  const rayGeometry=new THREE.BufferGeometry().setFromPoints([zero,new THREE.Vector3(0,0,-1)]);
  tracked.push(...[0,1].map(index=>{
    const pointer=renderer.xr.getController(index),grip=renderer.xr.getControllerGrip(index);
    const ray=new THREE.Line(rayGeometry,new THREE.LineBasicMaterial({color:0x9adfff}));
    pointer.add(ray);scene.add(pointer);scene.add(grip);
    try{grip.add(modelFactory.createControllerModel(grip));}catch{/* controller ray still works */}
    const state:Tracked={pointer,grip,ray,source:null,buttons:[],grabbing:false,side:'unknown'};
    pointer.addEventListener('connected',event=>{
      state.source=(event.data??null) as XRSource|null;
      state.side=state.source?.handedness??'unknown';state.buttons=[];
    });
    pointer.addEventListener('disconnected',()=>{
      state.source=null;state.buttons=[];state.grabbing=false;captureGrab();
    });
    pointer.addEventListener('select',()=>selectFromRay(pointer));
    pointer.addEventListener('squeezestart',()=>{
      if(!renderer.xr.isPresenting)return;
      state.grabbing=true;captureGrab();
    });
    pointer.addEventListener('squeezeend',()=>{state.grabbing=false;captureGrab();});
    return state;
  }));
  let navUsed=false;
  const navigationReady=[true,true];
  function pollGamepads(dt:number){
    tracked.forEach((state,index)=>{
      const buttons=state.source?.gamepad?.buttons;
      if(!buttons)return;
      const pressed=(n:number)=>!!buttons[n]?.pressed&&!state.buttons[n];
      if(pressed(4)||pressed(3))showMenu();
      if(pressed(5)&&palette.visible){xrMenu.back();renderPalette();}
      state.buttons=buttons.map(b=>b.pressed);
      if(palette.visible){
        const y=stick(state.source)[1];
        if(Math.abs(y)<.3)navigationReady[index]=true;
        if(Math.abs(y)>.7&&navigationReady[index]){
          navigationReady[index]=false;navUsed=true;xrMenu.move(y>0?1:-1);renderPalette();
        }
      }
    });
    if(tracked.some(t=>t.grabbing)){updateGrab();return;}
    if(palette.visible)return;
    const left=tracked.find(t=>t.side==='left')??tracked[0];
    const rightController=tracked.find(t=>t.side==='right')??tracked[1];
    const [lx,ly]=stick(left.source),[rx,ry]=stick(rightController.source);
    renderer.xr.getCamera().getWorldDirection(forward);
    forward.y=0;if(forward.lengthSq()<.0001)forward.set(0,0,-1);forward.normalize();
    right.set(-forward.z,0,forward.x);
    space.position.addScaledVector(right,lx*dt*1.3).addScaledVector(forward,-ly*dt*1.3);
    space.rotation.y-=rx*dt*1.1;
    space.scale.setScalar(bound(space.scale.x*Math.exp(-ry*dt),.22,2.8));
  }
  function placeMenu(){
    if(!palette.visible)return;
    const host=tracked.find(t=>t.side==='left'&&t.source)??tracked.find(t=>t.source);
    if(!host){palette.visible=false;return;}
    host.grip.updateWorldMatrix(true,false);
    const rotation=host.grip.getWorldQuaternion(new THREE.Quaternion());
    palette.position.copy(host.grip.getWorldPosition(new THREE.Vector3()));
    palette.position.add(new THREE.Vector3(.17,.28,-.38).applyQuaternion(rotation));
    renderer.xr.getCamera().getWorldPosition(headset);palette.lookAt(headset);
    palette.updateWorldMatrix(true,true);
  }
  renderer.xr.addEventListener('sessionstart',()=>{
    pauseAll();controls.enabled=false;
    showMenu(false);frames=0;recenterPending=true;previousFrame=0;
    grabMode='none';
    tracked.forEach(t=>{t.grabbing=false;t.buttons=[];});
    available.textContent='VR active. View is unobstructed: X/A opens hand-local tools; grips move/scale sandbox space.';
  });
  renderer.xr.addEventListener('sessionend',()=>{
    space.position.set(0,0,0);space.rotation.set(0,0,0);space.scale.setScalar(1);
    palette.visible=false;grabMode='none';
    tracked.forEach(t=>{t.grabbing=false;t.buttons=[];});
    controls.enabled=true;camera.position.copy(oldCamera);controls.target.copy(oldTarget);controls.update();
    pauseAll();available.textContent='Immersive session ended. Desktop controls restored.';
  });
  if(!window.isSecureContext)available.textContent='WebXR requires HTTPS.';
  else if(!navigator.xr)available.textContent='Immersive XR not supported in this browser.';
  else navigator.xr.isSessionSupported('immersive-vr').then(yes=>{
    if(!renderer.xr.isPresenting)available.textContent=yes?'Quest VR available. Select Enter VR.':'No immersive VR headset available.';
  }).catch(()=>{available.textContent='Could not check headset permissions.';});
  let lastDescription=0;
  return(now:number)=>{
    if(now-lastDescription>600){
      description.textContent=o.getSummary();renderDesktop();lastDescription=now;
    }
    for(const t of tracked){
      t.ray.visible=renderer.xr.isPresenting&&!!t.source;
      if(renderer.xr.isPresenting&&t.source){
        const hit=palette.visible?hitMenu(t.pointer):hitSpace(t.pointer);
        t.ray.scale.z=bound(hit?.distance??3,.08,3);
      }
    }
    if(!renderer.xr.isPresenting)return;
    const dt=previousFrame?bound((now-previousFrame)/1000,0,.05):0;previousFrame=now;
    frames++;
    if(recenterPending&&frames>1){
      renderer.xr.getCamera().getWorldPosition(headset);
      renderer.xr.getCamera().getWorldDirection(forward);
      forward.y=0;if(forward.lengthSq()<.0001)forward.set(0,0,-1);forward.normalize();
      space.position.copy(headset).addScaledVector(forward,2.4);
      space.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);
      space.scale.setScalar(.58);recenterPending=false;captureGrab();
    }
    if(!recenterPending)pollGamepads(dt);
    placeMenu();renderPalette();
  };
}
