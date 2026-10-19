import './usability.css';
import {siteFlow,bindInput} from './flow/site';

const resources = [
  { area: 'Website UI', title: 'Vercel Web Interface Guidelines', url: 'https://github.com/vercel-labs/web-interface-guidelines', description: 'Keyboard navigation, focus, forms, layout and interaction.', application: 'Applied: visible focus, skip navigation, larger controls, form errors and reduced motion.' },
  { area: 'UX process', title: 'UX Project Checklist', url: 'https://github.com/uxchecklist/uxchecklist.github.io', description: 'Research, user stories, task flows and design consistency.', application: 'Applied: a visible experiment workflow and direct navigation between labs. User research remains a separate activity.' },
  { area: 'Simulation development', title: 'PhET Development Overview', url: 'https://github.com/phetsims/phet-info/blob/main/doc/phet-development-overview.md', description: 'Simulation architecture, development and testing practices.', application: 'Applied: retain the model/view boundary and check deterministic execution alongside interaction tests.' },
  { area: 'Simulation components', title: 'PhET Scenery components', url: 'https://github.com/phetsims/scenery-phet', description: 'Interface components for PhET simulations.', application: 'Reference: play, pause, step and reset patterns. The app retains its native HTML and Three.js controls; Scenery is not installed.' },
  { area: 'Simulation accessibility', title: 'PhET Interactive Description Guide', url: 'https://github.com/phetsims/phet-info/blob/main/doc/interactive-description-technical-guide.md', description: 'Alternative input, state descriptions and responsive feedback.', application: 'Applied: textual state summaries, keyboard alternatives and polite feedback after deliberate actions.' },
  { area: 'Quest VR interactions', title: 'Meta First Hand', url: 'https://github.com/oculus-samples/Unity-FirstHand', description: 'Unity Interaction SDK examples for hand tracking and controllers.', application: 'Reference adapted to WebXR: visible targets and controller-ray selection. Unity hand-tracking components are not integrated.' },
  { area: 'Spatial UI', title: 'Meta Spatial SDK Samples', url: 'https://github.com/meta-quest/Meta-Spatial-SDK-Samples', description: 'Android spatial UI, mixed reality, physics and 3D examples.', application: 'Reference adapted to WebXR: a stationary control panel, explicit selection and recentering. The Android SDK is not installed.' },
  { area: 'Quest development', title: 'Meta Quest Agentic Tools', url: 'https://github.com/meta-quest/agentic-tools', description: 'Agent skills and technical references for Quest and Horizon OS development.', application: 'Reference for a future native Quest build. No external agent skills or SDK setup actions run automatically.' }
];

const studio = document.querySelector<HTMLElement>('.studio')!;
studio.setAttribute('role', 'main');
studio.id = 'main-content';
studio.tabIndex = -1;
const workspaceStatus = document.getElementById('toast');
if (workspaceStatus) studio.querySelector('.toolbar')?.insertAdjacentElement('afterend', workspaceStatus);
const skip = document.createElement('a');
skip.className = 'skip-link';
skip.href = '#main-content';
skip.textContent = 'Skip to laboratory';
document.body.prepend(skip);

const targets: [string, string, string][] = [
  ['.graph-section', 'network', 'Pattern network'],
  ['.spatial-section', 'spatial-viewer', '3D and VR'],
  ['#controller-menu', 'controller-menu', 'Controller menu'],
  ['.g6-experiment', 'g6-lab', 'G6 experiments'],
  ['.g7', 'g7-lab', 'G7 compiler'],
  ['.g8:not(.g9)', 'g8-lab', 'G8 binary kernel'],
  ['.g9', 'g9', 'G9 discovery'],
  ['#g10-lab', 'g10-lab', 'G10 composition']
];
const navigation = document.createElement('nav');
navigation.className = 'lab-navigation';
navigation.setAttribute('aria-label', 'Laboratory sections');
for (const [selector, id, title] of targets) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) continue;
  target.id = id;
  target.tabIndex = -1;
  target.setAttribute('aria-label', title);
  const link = document.createElement('a');
  link.href = '#' + id;
  link.textContent = title;
  navigation.append(link);
}
const referencesLink = document.createElement('a');
referencesLink.href = '#reference-library';
referencesLink.textContent = 'Reference library';
navigation.append(referencesLink);
const modularLink=document.createElement('a');modularLink.href='#modular-workflow';modularLink.textContent='Modular workflow';navigation.append(modularLink);
studio.querySelector('.mast')?.insertAdjacentElement('afterend', navigation);
navigation.addEventListener('click', event => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a');
  const target = link && document.getElementById(link.hash.slice(1));
  if (target) target.focus({preventScroll: true});
});

const workflow = document.createElement('aside');
workflow.className = 'workflow-guide';
workflow.setAttribute('aria-labelledby', 'workflow-title');
workflow.innerHTML = `<h2 id="workflow-title">A repeatable path through the lab</h2>
<ol><li><strong>Define:</strong> choose a binary program in G8.</li><li><strong>Compare:</strong> select a control and intervention in G9.</li><li><strong>Inspect:</strong> read descriptors, differences and exact recurring states.</li><li><strong>Verify:</strong> replay before recording a hypothesis and exporting evidence.</li></ol>
<p>The 3D viewer shows the G6 network. G8 and G9 have their own binary state and evidence.</p>`;
navigation.insertAdjacentElement('afterend', workflow);

const library = document.createElement('section');
library.id = 'reference-library';
library.className = 'panel4 reference-library';
library.tabIndex = -1;
library.setAttribute('aria-labelledby', 'references-title');
library.innerHTML = `<div class="section-head"><div><span class="micro">11 / REFERENCE LIBRARY</span><h2 id="references-title">Guidance behind the laboratory</h2></div></div><p>Open the original resources to explore their methods. The notes below distinguish what is applied here from references for future work.</p><div class="reference-grid"></div>`;
const grid = library.querySelector('.reference-grid')!;
function renderLibrary(items:typeof resources) {
grid.replaceChildren();
for (const resource of items) {
  const card = document.createElement('article');
  const area = document.createElement('span'); area.className = 'micro'; area.textContent = resource.area;
  const heading = document.createElement('h3');
  const link = document.createElement('a'); link.href = resource.url; link.textContent = resource.title; heading.append(link);
  const description = document.createElement('p'); description.textContent = resource.description;
  const application = document.createElement('p'); application.className = 'reference-application'; application.textContent = resource.application;
  card.append(area, heading, description, application); grid.append(card);
}
}
siteFlow.register({id:'reference-source',label:'Reference catalogue',inputs:{},outputs:{items:'snapshot'}});
bindInput('references','data',payload=>renderLibrary(payload.items as typeof resources));
siteFlow.connect({id:'reference-library',from:'reference-source',output:'items',to:'references',input:'data',enabled:true,delayed:false});
siteFlow.emit('reference-source','items',{items:resources});
document.querySelector('#g10-lab')?.insertAdjacentElement('afterend', library);

// Provide names for existing controls whose visible context is otherwise implicit.
const labels: Record<string, string> = {
  'g8-preset': 'G8 binary program preset', 'g8-name': 'G8 observer interpretation',
  'g7-preset': 'G7 compiler preset'
};
for (const [id, label] of Object.entries(labels)) document.getElementById(id)?.setAttribute('aria-label', label);
for (const id of ['g8-diagnostic', 'g9-status', 'toast']) {
  const status = document.getElementById(id);
  status?.setAttribute('aria-live', 'polite'); status?.setAttribute('aria-atomic', 'true');
}
for (const id of ['g8-source', 'g7-source']) {
  document.getElementById(id)?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault(); document.getElementById(id.replace('source', 'compile'))?.click();
    }
  });
}

for (const id of ['g7-assembly', 'g8-assembly']) {
  const assembly = document.getElementById(id);
  if (!assembly) continue;
  assembly.tabIndex = 0;
  assembly.setAttribute('role', 'region');
  assembly.setAttribute('aria-label', id.startsWith('g7') ? 'G7 machine instructions, scroll to inspect' : 'G8 binary instructions, scroll to inspect');
}

siteFlow.register({id:'identity',label:'Brand configuration',inputs:{},outputs:{identity:'snapshot'}});
siteFlow.register({id:'shell',label:'Website shell',inputs:{identity:'snapshot'},outputs:{},receive:(_port,payload)=>{
  const mark=document.querySelector('.identity .mark');if(!mark)return;
  const logo=document.createElement('img');logo.className='brand-logo';logo.src=String(payload.logo);logo.alt='Àtúnbí eye and renewal logo';logo.width=56;logo.height=56;mark.replaceWith(logo);
}});
siteFlow.connect({id:'identity-shell',from:'identity',output:'identity',to:'shell',input:'identity',enabled:true,delayed:false});
siteFlow.emit('identity','identity',{logo:'/resources/atunbi-logo.png'});
