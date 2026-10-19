import {requestControl} from './flow/site';
import type {LabAction, MenuCategory} from './controller-menu';

export type ViewActions = {camera:(action:string)=>void; summary:()=>string; pauseAll:()=>void; clearWorkspace:()=>void};
const byId = <T extends HTMLElement=HTMLElement>(id:string) => document.getElementById(id) as T | null;
const text = (id:string) => byId(id)?.textContent?.trim() || '';
const g6Ready = () => Number.parseInt(text('view-label')) > 0 ? null : 'Install an algorithm or load the workspace example first.';
function click(id:string) {
  const button=byId<HTMLButtonElement>(id);
  if(!button)throw Error('Control is not available: '+id);
  if(button.disabled)throw Error('Complete the prerequisite before using '+button.textContent+'.');
  requestControl(id);
}
function button(id:string,label:string,target:string,status?:string,extra:Partial<LabAction>={}):LabAction {
  return {id,label,available:()=>{const control=byId<HTMLButtonElement>(target);return !control?'Control not loaded.':control.disabled?'Compile or run the prerequisite first.':null;},run:()=>{click(target);return status?text(status):label+' completed.';},...extra};
}
function focus(id:string) {
  const control=byId(id);if(!control)throw Error('Editor not loaded.');
  control.scrollIntoView({block:'center'});if(!control.hasAttribute('tabindex')&&!control.matches('input,textarea,select'))control.tabIndex=-1;
  control.focus();return 'Editing controls are focused on the page.';
}
function cycle(id:string) {
  const select=byId<HTMLSelectElement>(id);if(!select||select.disabled||!select.options.length)throw Error('No choices available yet.');
  select.selectedIndex=(select.selectedIndex+1)%select.options.length;
  select.dispatchEvent(new Event('change',{bubbles:true}));
  return select.selectedOptions[0].textContent || select.value;
}
function preset(id:string,value:string,compileId:string) {
  const select=byId<HTMLSelectElement>(id);if(!select)throw Error('Preset control not loaded.');
  select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));click(compileId);
  return text(compileId.startsWith('g8')?'g8-diagnostic':'g7-diagnostics');
}
export function createLabActions(view:ViewActions):MenuCategory[] {
  return [
    {id:'workspace',label:'Workspace',description:'Create and edit the G6 environment network. File and detailed text editing use the page.',actions:[
      button('workspace-example','Load example','example-btn','toast',{confirm:'Replace the current G6 workspace with the example? Export it first if needed.'}),
      button('workspace-add','Add empty sandbox','add-btn','toast'),
      {id:'workspace-edit',label:'Edit algorithms and links',desktopOnly:true,run:()=>focus('layers-body')},
      button('workspace-import','Import network JSON','import-btn',undefined,{desktopOnly:true}),
      {id:'workspace-clear',label:'Clear workspace',confirm:'Clear every G6 environment and relationship? This removes the current network.',run:()=>{view.clearWorkspace();return text('toast');}}
    ]},
    {id:'simulation',label:'G6 simulation',description:'Run, pause and step the spatial G6 network. Controlled experiments keep the working state unchanged.',actions:[
      button('g6-toggle','Run / pause G6','run-btn','view-label',{available:g6Ready}),
      button('g6-step','Step G6 +1','step-btn','tick-label',{available:g6Ready}),
      button('g6-reset','Reset G6','reset-btn','toast',{confirm:'Reset all G6 algorithms to their seeded states?'}),
      button('g6-experiment','Run G6 experiment','g6-run','g6-observations',{available:g6Ready}),
      {id:'g6-ablation',label:'Next ablation mode',run:()=>cycle('g6-ablation')},
      {id:'g6-horizon',label:'Next experiment horizon',run:()=>cycle('g6-horizon')}
    ]},
    {id:'g7',label:'G7 compiler',description:'System-sentence compiler: independent runtime. Results are shown as text here; the spatial scene still shows G6.',actions:[
      button('g7-compile','Compile G7 source','g7-compile','g7-diagnostics'),
      button('g7-toggle','Run / pause G7','g7-run','g7-tick'),
      button('g7-step','Step G7 +1','g7-step','g7-tick'),
      button('g7-reset','Reset G7','g7-reset','g7-tick',{confirm:'Reset the compiled G7 runtime?'}),
      button('g7-compare','Compare G7 coupling','g7-paired','g7-control'),
      {id:'g7-preset',label:'Next G7 preset',run:()=>{cycle('g7-preset');click('g7-compile');return text('g7-diagnostics');}},
      {id:'g7-source',label:'Edit system sentences',desktopOnly:true,run:()=>focus('g7-source')}
    ]},
    {id:'g8',label:'G8 binary kernel',description:'Each matrix contains 1000 bits. Presets compile automatically. The spatial scene remains the G6 network.',actions:[
      button('g8-compile','Compile G8 source','g8-compile','g8-diagnostic'),
      button('g8-toggle','Run / pause G8','g8-run','g8-tick'),
      button('g8-step','Step G8 +1','g8-step','g8-tick'),
      button('g8-reset','Reset G8','g8-reset','g8-tick',{confirm:'Reset G8 bits and clear its observer interpretations?'}),
      button('g8-causality','Test G8 causality','g8-compare','g8-causality'),
      {id:'g8-feedback',label:'Reciprocal XOR preset',run:()=>preset('g8-preset','feedback','g8-compile')},
      {id:'g8-oneway',label:'One-way preset',run:()=>preset('g8-preset','oneway','g8-compile')},
      {id:'g8-isolated',label:'Isolated preset',run:()=>preset('g8-preset','isolated','g8-compile')},
      {id:'g8-depth',label:'Next binary depth slice',run:()=>{const input=byId<HTMLInputElement>('g8-depth')!;input.value=String((Number(input.value)+1)%10);input.dispatchEvent(new Event('input',{bubbles:true}));return 'Binary slice depth '+input.value+'. '+text('g8-count-a');}},
      {id:'g8-source',label:'Edit binary source',desktopOnly:true,run:()=>focus('g8-source')},
      {id:'g8-interpret',label:'Annotate G8 meaning',desktopOnly:true,run:()=>focus('g8-name')}
    ]},
    {id:'g9',label:'G9 discovery',description:'Matched baseline and intervention, exact recurrence and numeric descriptors. Human labels stay outside the kernel.',actions:[
      button('g9-run','Run discovery','g9-run','g9-status'),
      button('g9-replay','Verify exact replay','g9-replay','g9-status'),
      {id:'g9-mode',label:'Next intervention mode',run:()=>cycle('g9-mode')},
      {id:'g9-duration',label:'Next duration',run:()=>{const input=byId<HTMLInputElement>('g9-ticks')!;const values=[8,24,48,128];input.value=String(values[(values.indexOf(Number(input.value))+1)%values.length]);const at=byId<HTMLInputElement>('g9-at')!;if(Number(at.value)>=Number(input.value))at.value='0';return input.value+' ticks. Run discovery to apply.';}},
      {id:'g9-address',label:'Next flip address',available:()=>byId<HTMLInputElement>('g9-address')?.disabled?'Select the bit-flip intervention first.':null,run:()=>{const input=byId<HTMLInputElement>('g9-address')!;input.value=String((Number(input.value)+1)%1000);return 'Flip address '+input.value+'. Run discovery to apply.';}},
      {id:'g9-time',label:'Next intervention tick',available:()=>byId<HTMLInputElement>('g9-at')?.disabled?'Select the bit-flip intervention first.':null,run:()=>{const input=byId<HTMLInputElement>('g9-at')!;input.value=String((Number(input.value)+1)%Number(byId<HTMLInputElement>('g9-ticks')!.value));return 'Intervention tick '+input.value+'. Run discovery to apply.';}},
      {id:'g9-pattern',label:'Next detected pattern',available:()=>byId<HTMLSelectElement>('g9-pattern')?.options.length?null:'Run discovery first.',run:()=>{cycle('g9-pattern');return text('g9-pattern-info');}},
      {id:'g9-evidence',label:'Read measured evidence',available:()=>byId('g9-results')?.hidden?'Run discovery first.':null,run:()=>text('g9-effect')+' '+text('g9-period')},
      {id:'g9-note',label:'Write observer hypothesis',desktopOnly:true,run:()=>focus('g9-note')}
    ]},
    {id:'view',label:'View and safety',description:'Recenter without locomotion. Orbit and zoom apply on desktop; in VR look around using the headset.',actions:[
      {id:'view-recenter',label:'Recenter view',run:()=>{view.camera('reset');return 'Recenter requested.';}},
      {id:'view-describe',label:'Describe G6 state',run:()=>view.summary()},
      {id:'pause-all',label:'Pause all runtimes',run:()=>{view.pauseAll();return 'G6, G7 and G8 paused.';}},
      ...['left','right','up','down','in','out'].map(direction=>({id:'view-'+direction,label:(['in','out'].includes(direction)?'Zoom ':'Orbit ')+direction,desktopOnly:true,desktopReason:'In VR, look around with the headset. Recenter remains available.',run:()=>{view.camera(direction);return 'Camera '+direction+'.';}}))
    ]},
    {id:'evidence',label:'Evidence and notebook',description:'Exports download through the browser on the page. Observer notes remain separate from machine state.',actions:[
      button('export-network','Export G6 network','export-btn','toast',{desktopOnly:true}),
      button('export-g6','Export G6 experiment','g6-export',undefined,{desktopOnly:true}),
      button('export-g7','Export G7 evidence','g7-export',undefined,{desktopOnly:true}),
      button('export-g8','Export G8 binary','g8-export',undefined,{desktopOnly:true}),
      button('export-g9','Export G9 evidence','g9-export',undefined,{desktopOnly:true}),
      {id:'notebook',label:'Open hypothesis notebook',desktopOnly:true,run:()=>focus('g9-note')}
    ]},
    {id:'references',label:'Reference library',description:'Eight original resources, with notes distinguishing applied guidance from future native SDK work.',actions:[
      {id:'references-web',label:'Web UI and UX process',run:()=> 'Vercel Web Interface Guidelines and UX Project Checklist: keyboard access, focus, form recovery, clear task flows and design consistency.'},
      {id:'references-simulation',label:'PhET simulation guidance',run:()=> 'PhET Development Overview and Scenery components: separate simulation state from presentation, and provide play, pause, step and reset controls.'},
      {id:'references-accessibility',label:'PhET accessibility',run:()=> 'PhET Interactive Description Guide: alternative input, state descriptions and deliberate responsive feedback.'},
      {id:'references-meta',label:'Meta Quest references',run:()=> 'Meta First Hand, Meta Spatial SDK Samples and Meta Quest Agentic Tools. Native Unity and Android SDKs are references; this app uses WebXR.'},
      {id:'references-links',label:'Open all original links',desktopOnly:true,run:()=>focus('reference-library')}
    ]},
    {id:'composition',label:'G10 composition',description:'PID and simple equations operate a binary 1000-cell plant. The G6 spatial scene remains independent.',actions:[
      button('g10-step','Step system +1','g10-step','g10-readout'),
      button('g10-toggle','Run / pause system','g10-run','g10-readout'),
      button('g10-reset','Reset system','g10-reset','g10-status',{confirm:'Reset G10 to the same initial matrix and clear its experiment?'}),
      button('g10-compare','Compare PID / open loop','g10-compare','g10-status'),
      button('g10-replay','Verify system replay','g10-replay','g10-status'),
      button('g10-import','Import G8 matrix','g10-import','g10-status'),
      button('g10-export','Export system evidence','g10-export',undefined,{desktopOnly:true}),
      {id:'g10-preset',label:'Next system preset',run:()=>cycle('g10-preset')},
      {id:'g10-oscillator',label:'Toggle oscillator edge',run:()=>{const input=byId<HTMLInputElement>('g10-link-oscillator')!;input.checked=!input.checked;input.dispatchEvent(new Event('change',{bubbles:true}));return text('g10-status');}},
      {id:'g10-edit',label:'Edit PID gains',desktopOnly:true,run:()=>focus('g10-kp')}
    ]},
    {id:'workflow',label:'Modular workflow',description:'Actual website modules exchange typed signals. Disabled edges stop subsequent delivery; delayed feedback advances on explicit ticks.',actions:[
      button('flow-tick','Advance workflow tick','flow-tick','flow-status'),
      button('flow-save','Save wiring','flow-save','flow-status',{desktopOnly:true}),
      button('flow-load','Load saved wiring','flow-load','flow-status',{desktopOnly:true}),
      button('flow-reset','Restore default wiring','flow-reset','flow-status',{confirm:'Restore default website connections?'}),
      button('flow-export','Export wiring JSON','flow-export',undefined,{desktopOnly:true}),
      {id:'flow-edit',label:'Edit module connections',desktopOnly:true,run:()=>focus('modular-workflow')}
    ]}
  ];
}
