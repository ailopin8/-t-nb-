import * as THREE from 'three';
import {ControllerMenu} from './controller-menu';
import {createLabActions} from './lab-actions';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

type SpatialOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  getSummary: () => string;
  isRunning: () => boolean;
  pause: () => void;
  toggleRun: () => void;
  step: () => void;
  clearWorkspace: () => void;
};

export function installSpatialControls(options: SpatialOptions) {
  const {renderer, scene, camera, controls, content} = options;
  const canvas = renderer.domElement;
  const root = document.querySelector<HTMLElement>('.spatial-section')!;
  const access = document.createElement('div');
  access.className = 'viewer-access';
  access.innerHTML = `<div class="camera-controls" role="group" aria-label="3D camera controls">
    <button type="button" data-camera="left">Orbit left</button>
    <button type="button" data-camera="right">Orbit right</button>
    <button type="button" data-camera="up">Orbit up</button>
    <button type="button" data-camera="down">Orbit down</button>
    <button type="button" data-camera="in">Zoom in</button>
    <button type="button" data-camera="out">Zoom out</button>
    <button type="button" data-camera="reset">Recenter view</button>
    <button type="button" id="describe-scene">Describe current state</button>
  </div>
  <p id="camera-help">Focus the 3D view: arrow keys orbit, + / − zoom, Home recenters. Buttons provide the same camera actions. These controls change the view only.</p>
  <p id="scene-description" class="sim-description"></p>
  <p id="spatial-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
  <details><summary>VR controls and availability</summary><p id="xr-availability">Checking immersive VR support…</p>
  <p>Load a G6 network before entering VR. Select a category with the controller ray and trigger. Thumbstick up/down highlights entries; grip returns to categories. Previous and Next change pages. The menu controls G6, G7, G8 and G9; the 3D scene displays G6. Use the headset system menu to leave VR. G8 and G9 remain separate experiments on the page. Hand pinch selection depends on whether the browser exposes a WebXR select ray; native hand-tracking SDKs are not installed.</p></details>`;
  root.append(access);
  const feedback = access.querySelector<HTMLElement>('#spatial-feedback')!;
  const description = access.querySelector<HTMLElement>('#scene-description')!;
  const availability = access.querySelector<HTMLElement>('#xr-availability')!;
  document.getElementById('enter-vr')?.setAttribute('aria-describedby','xr-availability');
  const announce = (message: string) => {feedback.textContent = message;};
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Interactive 3D G6 pattern view');
  canvas.setAttribute('aria-describedby', 'camera-help scene-description');
  const originalPosition = camera.position.clone();
  const originalTarget = controls.target.clone();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updateMotion = () => {controls.enableDamping = !motion.matches;};
  updateMotion();
  motion.addEventListener('change', updateMotion);

  function cameraAction(action: string) {
    if (renderer.xr.isPresenting) {
      if (action === 'reset') recenterPending = true;
      else announce('Use the headset pose to look around in VR. Recenter places the content in front of you.');
      return;
    }
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (action === 'reset') {
      camera.position.copy(originalPosition); controls.target.copy(originalTarget);
    } else {
      if (action === 'left') spherical.theta -= .18;
      if (action === 'right') spherical.theta += .18;
      if (action === 'up') spherical.phi -= .12;
      if (action === 'down') spherical.phi += .12;
      if (action === 'in') spherical.radius *= .85;
      if (action === 'out') spherical.radius *= 1.15;
      spherical.phi = Math.max(.15, Math.min(Math.PI - .15, spherical.phi));
      spherical.radius = Math.max(1.2, Math.min(20, spherical.radius));
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    }
    controls.update();
    announce(action === 'reset' ? '3D view recentered.' : 'Camera ' + action + '. Simulation state unchanged.');
  }
  access.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-camera]');
    if (button) cameraAction(button.dataset.camera!);
  });
  const keys: Record<string,string> = {ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', '+':'in', '=':'in', '-':'out', Home:'reset'};
  canvas.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !keys[event.key]) return;
    event.preventDefault(); event.stopPropagation(); cameraAction(keys[event.key]);
  });
  access.querySelector('#describe-scene')!.addEventListener('click', () => {
    description.textContent = options.getSummary(); announce(description.textContent);
  });

  // Keep the G6 geometry separate from its presentation and controller targets.
  const rig = new THREE.Group();
  scene.remove(content); rig.add(content); scene.add(rig);
  const panel = new THREE.Group(); rig.add(panel); panel.visible = false;
  const pauseAll = () => {
    options.pause(); document.dispatchEvent(new CustomEvent('atunbi:pause-all'));
  };
  document.addEventListener('visibilitychange', () => {if(document.hidden)pauseAll();});
  const categories = createLabActions({camera:cameraAction,summary:options.getSummary,pauseAll,clearWorkspace:options.clearWorkspace});
  const desktopMenu = new ControllerMenu(categories);
  const xrMenu = new ControllerMenu(categories,'xr');
  const menuSection = document.createElement('section');
  menuSection.id='controller-menu'; menuSection.className='controller-menu';
  menuSection.setAttribute('aria-labelledby','controller-menu-title');
  menuSection.innerHTML=`<h3 id="controller-menu-title">Controller menu</h3><p>Choose a category, then an action. The same actions are available through controller rays in VR. Text entry, file selection and downloads use the page.</p><h4 id="controller-category">Categories</h4><div id="controller-actions" class="controller-actions"></div><div class="controller-pagination"><button type="button" data-menu="back">Back / cancel</button><button type="button" data-menu="previous">Previous</button><span id="controller-page"></span><button type="button" data-menu="next">Next</button></div><p id="controller-feedback" role="status" aria-live="polite" aria-atomic="true"></p>`;
  access.append(menuSection);
  let lastDesktop='';
  function renderDesktop() {
    const entries=desktopMenu.entries;
    const signature=JSON.stringify([desktopMenu.title,desktopMenu.page,entries,desktopMenu.message]);
    if(signature===lastDesktop)return;
    lastDesktop=signature;
    const hadMenuFocus=menuSection.contains(document.activeElement);
    const focused=(document.activeElement as HTMLElement)?.dataset.menu;
    const list=menuSection.querySelector('#controller-actions')!;list.replaceChildren();
    menuSection.querySelector('#controller-category')!.textContent=desktopMenu.title;
    for(const entry of entries) {
      const wrapper=document.createElement('div'),button=document.createElement('button');
      button.type='button';button.dataset.menu=entry.id;button.textContent=entry.label;button.disabled=!entry.enabled;
      wrapper.append(button);
      if(entry.reason) {const reason=document.createElement('small');reason.textContent=entry.reason;wrapper.append(reason);}
      list.append(wrapper);
    }
    menuSection.querySelector('#controller-feedback')!.textContent=desktopMenu.message;
    menuSection.querySelector('#controller-page')!.textContent='Page '+(desktopMenu.page+1)+' of '+desktopMenu.pageCount;
    for(const id of ['previous','next']) menuSection.querySelector<HTMLButtonElement>('[data-menu='+id+']')!.disabled=desktopMenu.pageCount===1;
    menuSection.querySelector<HTMLButtonElement>('[data-menu=back]')!.disabled=!desktopMenu.category&&!desktopMenu.pending;
    if(focused) {
      const target=menuSection.querySelector<HTMLButtonElement>('[data-menu="'+focused+'"]') || (hadMenuFocus?menuSection.querySelector<HTMLButtonElement>('#controller-actions button:not(:disabled)'):null);
      target?.focus({preventScroll:true});
    }
  }
  menuSection.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-menu]');if(!button)return;
    const categoryBefore=desktopMenu.category;desktopMenu.activate(button.dataset.menu!);renderDesktop();
    if(categoryBefore!==desktopMenu.category||desktopMenu.pending)menuSection.querySelector<HTMLButtonElement>('#controller-actions button:not(:disabled)')?.focus({preventScroll:true});
  });
  menuSection.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();desktopMenu.back();renderDesktop();}});
  renderDesktop();
  const targets: THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>[]=[];
  const buttonContexts:CanvasRenderingContext2D[]=[];
  for(let i=0;i<9;i++) {
    const labelCanvas=document.createElement('canvas');labelCanvas.width=768;labelCanvas.height=144;
    buttonContexts.push(labelCanvas.getContext('2d')!);
    const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    const width=i<6?1.98:1.25;
    const button=new THREE.Mesh(new THREE.PlaneGeometry(width,.36),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    button.position.set(i<6?(i%2===0?-1.07:1.07):(i-7)*1.43,i<6?-1.55-Math.floor(i/2)*.43:-2.91,.7);
    panel.add(button);targets.push(button);
  }
  const statusCanvas=document.createElement('canvas');statusCanvas.width=1024;statusCanvas.height=256;
  const statusContext=statusCanvas.getContext('2d')!;
  const statusTexture=new THREE.CanvasTexture(statusCanvas);statusTexture.colorSpace=THREE.SRGBColorSpace;
  const statusPanel=new THREE.Mesh(new THREE.PlaneGeometry(4.15,1.04),new THREE.MeshBasicMaterial({map:statusTexture,side:THREE.DoubleSide}));
  statusPanel.position.set(0,-.76,.7);panel.add(statusPanel);
  let previousVRStatus='';
  function renderXR() {
    const entries=xrMenu.entries;
    const buttons=[...entries,...Array.from({length:6-entries.length},()=>null),
      {id:'back',label:'Back / cancel',enabled:!!xrMenu.category||!!xrMenu.pending,reason:null},
      {id:'previous',label:'Previous',enabled:xrMenu.pageCount>1,reason:null},
      {id:'next',label:'Next',enabled:xrMenu.pageCount>1,reason:null}];
    const signature=JSON.stringify([buttons,xrMenu.selected,xrMenu.title,xrMenu.message,options.getSummary().split('. ')[0]]);
    if(signature===previousVRStatus)return;
    previousVRStatus=signature;
    buttons.forEach((entry,i)=>{
      const button=targets[i];button.visible=!!entry;button.userData.menu=entry?.id;button.userData.enabled=entry?.enabled;
      const ctx=buttonContexts[i];ctx.fillStyle=entry?.enabled?(i===xrMenu.selected?'#285775':'#13334a'):'#26313d';ctx.fillRect(0,0,768,144);
      ctx.strokeStyle=i===xrMenu.selected?'#ffffff':'#a5ecff';ctx.lineWidth=i===xrMenu.selected?10:5;ctx.strokeRect(5,5,758,134);
      ctx.fillStyle=entry?.enabled?'#ffffff':'#c1c7ce';ctx.font='bold 43px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(entry?.label||'',384,72,730);
      button.material.map!.needsUpdate=true;
    });
    statusContext.fillStyle='#102b3d';statusContext.fillRect(0,0,1024,256);
    statusContext.fillStyle='#ffffff';statusContext.textAlign='center';statusContext.font='bold 36px sans-serif';
    statusContext.fillText(xrMenu.title+' · '+(xrMenu.page+1)+'/'+xrMenu.pageCount,512,42);
    statusContext.font='28px sans-serif';
    const words=xrMenu.message.replace(/\s+/g,' ').split(' '),lines:string[]=[];let line='';
    for(const word of words) {if((line+' '+word).length>62){lines.push(line);line=word;}else line+=(line?' ':'')+word;}
    if(line)lines.push(line);
    lines.slice(0,3).forEach((value,index)=>statusContext.fillText(value,512,87+index*34,1000));
    statusContext.font='25px sans-serif';statusContext.fillStyle='#a5ecff';statusContext.fillText(options.getSummary().split('. ')[0],512,232,1000);
    statusTexture.needsUpdate=true;
  }
  renderXR();
  const raycaster = new THREE.Raycaster();
  const rotation = new THREE.Matrix4();
  function hit(controller: THREE.Object3D) {
    controller.updateWorldMatrix(true,false);
    rotation.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0,0,-1).applyMatrix4(rotation).normalize();
    rig.updateWorldMatrix(true,true);
    return raycaster.intersectObjects(targets.filter(target=>target.visible),false)[0];
  }
  const controllers = [renderer.xr.getController(0),renderer.xr.getController(1)];
  const stickReady=[true,true];
  let stickNavigation=false;
  const rays = controllers.map(controller => {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]);
    const ray = new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xa5ecff}));
    ray.scale.z = 3; controller.add(ray); scene.add(controller);
    controller.addEventListener('select', () => {
      if (!renderer.xr.isPresenting) return;
      const intersection = hit(controller);
      if (intersection) xrMenu.activate(intersection.object.userData.menu);
      else if(stickNavigation) {const entry=xrMenu.entries[xrMenu.selected];if(entry)xrMenu.activate(entry.id);}
      renderXR(); announce(xrMenu.message);
    });
    controller.addEventListener('squeeze',()=>{if(renderer.xr.isPresenting){xrMenu.back();renderXR();}});
    controller.addEventListener('connected',event=>{controller.userData.inputSource=event.data;});
    controller.addEventListener('disconnected',()=>{delete controller.userData.inputSource;});
    return ray;
  });
  let recenterPending = false;
  let framesSinceEntry = 0;
  let savedPosition = camera.position.clone();
  let savedTarget = controls.target.clone();
  const headPosition = new THREE.Vector3();
  const forward = new THREE.Vector3();
  renderer.xr.addEventListener('sessionstart', () => {
    savedPosition = camera.position.clone(); savedTarget = controls.target.clone();
    pauseAll(); controls.enabled = false; panel.visible = true;
    framesSinceEntry = 0; recenterPending = true; stickNavigation=false; xrMenu.back();renderXR();
    availability.textContent = 'VR session active. Choose a menu category with the ray and select trigger. Grip goes back; thumbstick changes the highlighted entry.';
  });
  renderer.xr.addEventListener('sessionend', () => {
    rig.position.set(0,0,0); rig.rotation.set(0,0,0); rig.scale.setScalar(1);
    panel.visible = false; controls.enabled = true;
    camera.position.copy(savedPosition); controls.target.copy(savedTarget); controls.update();
    pauseAll(); announce('Returned from VR. G6, G7 and G8 are paused.');
    availability.textContent = 'VR session ended. You can enter again or use the 3D controls.';
  });
  if (!window.isSecureContext) availability.textContent = 'VR requires HTTPS. The desktop 3D controls remain available.';
  else if (!navigator.xr) availability.textContent = 'Immersive VR is unavailable in this browser. Use the desktop 3D controls, or open this page in a WebXR headset browser.';
  else navigator.xr.isSessionSupported('immersive-vr').then(supported => {
    if (!renderer.xr.isPresenting) availability.textContent = supported ? 'Immersive VR is available. Use Enter VR to request a headset session.' : 'This browser has no available immersive VR device. The desktop 3D controls remain available.';
  }).catch(() => {availability.textContent = 'VR availability could not be checked. Check headset permissions or use the desktop 3D controls.';});

  let lastDescription = 0;
  return (now: number) => {
    if (now-lastDescription > 500) {description.textContent = options.getSummary(); renderDesktop(); lastDescription = now;}
    controllers.forEach((controller,index) => {
      rays[index].visible = renderer.xr.isPresenting;
      if (renderer.xr.isPresenting) {const intersection=hit(controller); rays[index].scale.z=intersection?.distance ?? 3;}
    });
    if (!renderer.xr.isPresenting) return;
    controllers.forEach((controller,index)=>{
      const source=controller.userData.inputSource as {gamepad?:{axes:readonly number[]}}|undefined;
      const axes=source?.gamepad?.axes;
      const value=axes?.[3]??axes?.[1]??0;
      if(Math.abs(value)<.3)stickReady[index]=true;
      if(Math.abs(value)>.7&&stickReady[index]) {stickReady[index]=false;stickNavigation=true;xrMenu.move(value>0?1:-1);}
    });
    renderXR();
    framesSinceEntry++;
    if (recenterPending && framesSinceEntry > 1) {
      const xrCamera = renderer.xr.getCamera();
      xrCamera.getWorldPosition(headPosition); xrCamera.getWorldDirection(forward);
      forward.y=0;
      if (forward.lengthSq() < .001) forward.set(0,0,-1);
      forward.normalize();
      rig.position.copy(headPosition).addScaledVector(forward,2.6);
      rig.rotation.set(0,Math.atan2(-forward.x,-forward.z),0); rig.scale.setScalar(.55);
      recenterPending = false; announce('VR content recentered in front of you.');
    }
  };
}
