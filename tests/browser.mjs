import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4174';
let server;
if(!process.env.TEST_BASE_URL) {
  server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4174','--strictPort'],{cwd:root,stdio:'pipe'});
  await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('ready in'))resolve();});server.on('exit',code=>reject(Error('Preview exited '+code)));setTimeout(()=>reject(Error('Preview timeout')),10000).unref();});
}
const report=[];
const errors=[];
const exercisedActions=new Set();
let browser;
try {
  try {browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});}
  catch(error) {if(process.env.BROWSER_CHANNEL)throw error;browser=await chromium.launch({headless:true});}
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  const menu=page.locator('#controller-menu');
  const feedback=()=>menu.locator('#controller-feedback').innerText();
  async function category(id) {
    if(!await menu.locator('[data-menu=back]').isDisabled())await menu.locator('[data-menu=back]').click();
    for(let i=0;i<3&&!await menu.locator(`[data-menu="${id}"]`).count();i++)await menu.locator('[data-menu=next]').click();
    await menu.locator(`[data-menu="${id}"]`).click();
  }
  async function action(id,confirm=false) {
    for(let i=0;i<3&&!await menu.locator(`[data-menu="${id}"]`).count();i++)await menu.locator('[data-menu=next]').click();
    await menu.locator(`[data-menu="${id}"]`).click();
    exercisedActions.add(id);
    if(confirm)await menu.locator('[data-menu=confirm]').click();
    assert.doesNotMatch(await feedback(),/Action failed:/);
  }
  async function check(name,run) {
    try {await run();report.push({name,status:'PASS'});console.log('PASS:',name);}
    catch(error) {report.push({name,status:'FAIL',error:error.message});console.error('FAIL:',name,error.message);}
  }
  await check('Controller prerequisites, confirmation and cancel',async()=>{
    await category('simulation');assert.ok(await menu.locator('[data-menu=g6-step]').isDisabled());
    await category('g8');assert.ok(await menu.locator('[data-menu=g8-step]').isDisabled());
    await action('g8-compile');await action('g8-step');assert.match(await page.locator('#g8-tick').innerText(),/0001/);
    await action('g8-reset');await action('cancel');assert.match(await page.locator('#g8-tick').innerText(),/0001/);
    await action('g8-reset',true);assert.match(await page.locator('#g8-tick').innerText(),/0000/);
  });
  await check('Workspace creation, clear guards, internal and external editing',async()=>{
    await category('workspace');await action('workspace-add');assert.equal(await page.locator('#node-count').innerText(),'1');
    await page.locator('[data-algo="1"]').selectOption('diffusion');
    await action('workspace-edit');await page.locator('#add-layer-type').selectOption('growth');await page.locator('#add-layer-btn').click();
    await page.locator('#inner-from').selectOption('1');await page.locator('#inner-to').selectOption('2');await page.locator('#inner-connect').click();
    assert.match(await page.locator('#layers-body').innerText(),/2 \/ 4 algorithms/);
    await action('workspace-clear');await action('cancel');assert.equal(await page.locator('#node-count').innerText(),'1');
    await action('workspace-clear',true);assert.equal(await page.locator('#node-count').innerText(),'0');
    await action('workspace-example',true);assert.equal(await page.locator('#node-count').innerText(),'2');assert.equal(await page.locator('#edge-count').innerText(),'1');
    await page.locator('[data-edge-mode]').selectOption('inhibit');await page.locator('[data-edge-enabled]').uncheck();await page.locator('[data-edge-enabled]').check();await page.locator('[data-edge-mode]').selectOption('excite');
    const header=page.locator('[data-drag="1"]');const before=await header.evaluate(e=>e.parentElement.style.left);await header.focus();await header.press('ArrowRight');assert.notEqual(await header.evaluate(e=>e.parentElement.style.left),before);
  });
  await check('G6 transport, horizon, ablation modes and non-mutating experiments',async()=>{
    await category('simulation');await action('g6-step');assert.match(await page.locator('#tick-label').innerText(),/0001/);
    for(let i=0;i<3;i++){await action('g6-experiment');assert.match(await page.locator('#g6-observations').innerText(),/divergence|interaction|relationship/i);await action('g6-ablation');}
    assert.match(await page.locator('#tick-label').innerText(),/0001/);
    await action('g6-horizon');await action('g6-toggle');await page.waitForFunction(()=>!document.querySelector('#tick-label').textContent.includes('0001'));await action('g6-toggle');await action('g6-reset',true);assert.match(await page.locator('#tick-label').innerText(),/0000/);
  });
  await check('G7 compile, presets, transport, coupling and evidence comparison',async()=>{
    const source=await page.locator('#g7-source').inputValue();await page.locator('#g7-source').fill('INVALID');
    await category('g7');await action('g7-compile');assert.doesNotMatch(await page.locator('#g7-diagnostics').innerText(),/Valid/);
    await page.locator('#g7-source').fill(source);await action('g7-compile');assert.match(await page.locator('#g7-diagnostics').innerText(),/Valid/);
    await action('g7-step');assert.match(await page.locator('#g7-tick').innerText(),/1/);
    await action('g7-toggle');await page.waitForFunction(()=>Number(document.querySelector('#g7-tick').textContent.replace(/\D/g,''))>1);await action('g7-toggle');
    await action('g7-reset',true);assert.equal(await page.locator('#g7-tick').innerText(),'TICK 0');await action('g7-compare');assert.match(await page.locator('#g7-control').innerText(),/60/);
    await action('g7-preset');await action('g7-source');await page.locator('#g7-coupling').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#g7-coupling').inputValue(),'74');await page.locator('#g7-speed').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#g7-speed').inputValue(),'7');
  });
  await check('G8 preset compilation, packets, causality, source validation and annotations',async()=>{
    await category('g8');for(const preset of ['g8-oneway','g8-isolated','g8-feedback']){await action(preset);assert.match(await page.locator('#g8-diagnostic').innerText(),/Compiled/);}
    await action('g8-step');await action('g8-step');assert.doesNotMatch(await page.locator('#g8-packets').innerText(),/^0 PACKETS$/);
    await action('g8-causality');assert.match(await page.locator('#g8-causality').innerText(),/24 matched ticks/);await action('g8-depth');assert.equal(await page.locator('#g8-depth').inputValue(),'5');
    await action('g8-interpret');await page.locator('#g8-name').fill('Observed packet pattern');await page.locator('#g8-save').click();assert.match(await page.locator('#g8-labels').innerText(),/Observed packet pattern/);
    await action('g8-toggle');await page.waitForFunction(()=>Number(document.querySelector('#g8-tick').textContent.replace(/\D/g,''))>2);await action('g8-toggle');
    await action('g8-source');const source=await page.locator('#g8-source').inputValue();await page.locator('#g8-source').fill('MATRIX A RULE 01011010\nA BIT (10,0,0) = 1');await action('g8-compile');assert.match(await page.locator('#g8-diagnostic').innerText(),/coordinate/);await page.locator('#g8-source').fill(source);await page.locator('#g8-source').press('Control+Enter');assert.match(await page.locator('#g8-diagnostic').innerText(),/Compiled/);
  });
  await check('G9 controller settings, all interventions, descriptors, recurrence and replay',async()=>{
    await category('g9');await action('g9-duration');assert.equal(await page.locator('#g9-ticks').inputValue(),'48');
    await action('g9-address');await action('g9-time');assert.equal(await page.locator('#g9-address').inputValue(),'445');assert.equal(await page.locator('#g9-at').inputValue(),'1');
    await page.locator('#g9-ticks').fill('8');
    for(const mode of ['flip','uncouple','none']) {
      await page.locator('#g9-mode').selectOption(mode);await action('g9-run');assert.equal(await page.locator('#g9-metrics tr').count(),4);await action('g9-replay');assert.match(await page.locator('#g9-status').innerText(),/Replay PASS/);
      if(mode==='none')assert.match(await page.locator('#g9-effect').innerText(),/A: 0\/1000/);
    }
    await action('g9-pattern');await action('g9-evidence');assert.match(await feedback(),/Hamming distance/);await action('g9-mode');assert.equal(await page.locator('#g9-mode').inputValue(),'flip');
    await action('g9-note');await page.locator('#g9-note').fill('Observed deterministic recurrence');await page.locator('#g9-hypothesis').selectOption('Inconclusive');await page.locator('#g9-note').press('Enter');assert.match(await page.locator('#g9-notes').innerText(),/Inconclusive: Observed deterministic recurrence/);
    await page.locator('#g9-ticks').fill('');await page.locator('#g9-run').click();assert.ok(await page.locator('#g9-ticks').evaluate(e=>document.activeElement===e));await page.locator('#g9-ticks').fill('8');await action('g9-run');
  });
  await check('Evidence exports and G6 import round trip with invalid-file guard',async()=>{
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});await category('evidence');let networkFile;
    for(const id of ['export-network','export-g6','export-g7','export-g8','export-g9']) {
      const downloading=page.waitForEvent('download');await action(id);const file=await downloading;const output=path.join(root,'test-results',file.suggestedFilename());await file.saveAs(output);const parsed=JSON.parse(await fs.readFile(output,'utf8'));assert.ok(parsed.format);if(id==='export-network')networkFile=output;if(id==='export-g9')assert.equal(parsed.histories.baseline[0][0].bits.length,1000);
    }
    await action('notebook');await category('workspace');await action('workspace-clear',true);assert.equal(await page.locator('#node-count').innerText(),'0');
    const picker=page.waitForEvent('filechooser');await action('workspace-import');await (await picker).setFiles(networkFile);await page.waitForFunction(()=>document.querySelector('#node-count').textContent==='2');
    const invalid=path.join(root,'test-results/invalid.json');await fs.writeFile(invalid,'{"format":"unknown"}');await page.locator('#import-file').setInputFiles(invalid);await page.waitForFunction(()=>/Import failed|not valid|could not|unsupported/i.test(document.querySelector('#toast').textContent));assert.equal(await page.locator('#node-count').innerText(),'2');
  });
  await check('View, pause-all, reference categories and eight original links',async()=>{
    await category('view');for(const id of ['view-left','view-right','view-up','view-down','view-in','view-out','view-recenter','view-describe','pause-all'])await action(id);
    assert.match(await feedback(),/G6, G7 and G8 paused/);
    await category('references');for(const id of ['references-web','references-simulation','references-accessibility','references-meta','references-links'])await action(id);
    assert.equal(await page.locator('#reference-library article a').count(),8);await page.locator('#scene').focus();await page.keyboard.press('Home');assert.match(await page.locator('#spatial-feedback').innerText(),/recentered/);
  });
  await check('PID composition, all drivers, matrix transfer and exact replay',async()=>{
    await category('composition');await action('g10-step');assert.match(await page.locator('#g10-readout').innerText(),/Tick 1/);
    await action('g10-toggle');await page.waitForFunction(()=>Number(document.querySelector('#g10-readout').textContent.match(/Tick (\d+)/)[1])>1);await action('g10-toggle');
    await action('g10-reset',true);await action('g10-compare');await action('g10-replay');assert.match(await page.locator('#g10-status').innerText(),/replay PASS/);
    const report=await page.locator('#g10-comparison').innerText();assert.match(report,/64 matched ticks/);
    const download=page.waitForEvent('download');await action('g10-export');assert.equal((await download).suggestedFilename(),'atunbi-composition-evidence.json');
    await action('g10-preset');await action('g10-step');await action('g10-oscillator');await action('g10-edit');
    await page.locator('#g10-kp').fill('');await page.locator('#g10-apply').click();assert.ok(await page.locator('#g10-kp').evaluate(e=>document.activeElement===e));await page.locator('#g10-kp').fill('.7');await page.locator('#g10-apply').click();
    await action('g10-import');assert.match(await page.locator('#g10-status').innerText(),/Imported 1000 bits/);
    await page.locator('#g9-workflow-seed').check();await page.locator('#g9-run').click();await page.locator('#g9-replay').click();assert.match(await page.locator('#g9-status').innerText(),/Replay PASS/);await page.locator('#g9-workflow-seed').uncheck();
    await page.locator('#g10-preset').selectOption('coupled');await page.locator('#g10-step').click();await page.locator('#g10-compare').click();await page.locator('#g10-replay').click();assert.match(await page.locator('#g10-status').innerText(),/replay PASS/);
  });
  await check('Actual workflow disconnection, delayed delivery, validation and saved wiring',async()=>{
    await page.getByRole('checkbox',{name:'Enable controls-g8',exact:true}).uncheck();await category('g8');await action('g8-step').catch(()=>{});assert.match(await feedback(),/disconnected/);
    await page.getByRole('checkbox',{name:'Enable controls-g8',exact:true}).check();await action('g8-step');
    const old=await page.locator('#g8-tick').innerText();await page.getByRole('checkbox',{name:'Enable g8-view',exact:true}).uncheck();await page.locator('#g8-step').click();assert.equal(await page.locator('#g8-tick').innerText(),old);await page.getByRole('checkbox',{name:'Enable g8-view',exact:true}).check();await page.locator('#g8-step').click();assert.notEqual(await page.locator('#g8-tick').innerText(),old);
    await page.getByRole('checkbox',{name:'Enable source-g9',exact:true}).uncheck();await page.locator('#g9-run').click();assert.match(await page.locator('#g9-status').innerText(),/Reconnect source-g9/);await page.getByRole('checkbox',{name:'Enable source-g9',exact:true}).check();
    await page.locator('#flow-from').selectOption('sources.source');await page.locator('#flow-to').selectOption('g6-view.state');await page.getByRole('button',{name:'Connect modules',exact:true}).click();assert.match(await page.locator('#flow-status').innerText(),/Rejected/);
    await page.locator('#flow-from').selectOption('g8.state');await page.locator('#flow-to').selectOption('metrics.data');await page.locator('#flow-delay').check();await page.getByRole('button',{name:'Connect modules',exact:true}).click();await page.locator('#g8-step').click();
    await category('workflow');await action('flow-tick');await action('flow-save');await page.getByRole('checkbox',{name:'Enable controls-g8',exact:true}).uncheck();await action('flow-load');assert.ok(await page.getByRole('checkbox',{name:'Enable controls-g8',exact:true}).isChecked());
    const downloading=page.waitForEvent('download');await action('flow-export');const file=await downloading;const output=path.join(root,'test-results/atunbi-workflow.json');await file.saveAs(output);await page.locator('#flow-file').setInputFiles(output);await page.waitForFunction(()=>document.querySelector('#flow-status').textContent.includes('imported'));
    await action('flow-edit');await action('flow-reset',true);assert.equal(await page.locator('.flow-nodes article').count()>15,true);
  });
  await check('Logo and modular view state are present',async()=>{
    const logo=page.getByRole('img',{name:'Àtúnbí eye and renewal logo',exact:true});assert.ok(await logo.evaluate(e=>e.complete&&e.naturalWidth>0));assert.equal(await page.locator('#g10-slice span').count(),100);
  });
  await check('Notebook persistence, mobile forms, keyboard navigation and accessibility',async()=>{
    await page.reload();await page.locator('#g9-run').click();assert.match(await page.locator('#g9-notes').innerText(),/Observed deterministic recurrence/);
    await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),375);assert.equal(await page.locator('#g9-ticks').evaluate(e=>getComputedStyle(e).fontSize),'16px');
    await category('g9');assert.ok((await menu.locator('[data-menu=g9-run]').boundingBox()).height>=44);
    await page.emulateMedia({reducedMotion:'reduce'});await page.addScriptTag({path:path.join(root,'node_modules/axe-core/axe.min.js')});
    const scan=()=>page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.html)}));});
    assert.deepEqual(await scan(),[]);await page.setViewportSize({width:1280,height:900});assert.deepEqual(await scan(),[]);
  });
  await check('Simulated WebXR controller menu and restored desktop state',async()=>{
    const xrPage=await browser.newPage();await xrPage.goto(base+'/tests/spatial.test.html');await xrPage.waitForFunction(()=>document.body.dataset.result==='PASS',{},{timeout:10000});await xrPage.close();
  });
  await check('Coverage of all categorized controller actions',async()=>{
    const inventory=JSON.parse(await fs.readFile(path.join(root,'docs/controller-menu.json'),'utf8'));
    const ids=inventory.flatMap(category=>category.actions.map(action=>action.id));
    assert.deepEqual(ids.filter(id=>!exercisedActions.has(id)),[],'Every categorized menu action must be exercised');
  });
  assert.deepEqual(errors,[],'No browser runtime errors');
} finally {
  await browser?.close();server?.kill('SIGTERM');
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  await fs.writeFile(path.join(root,'test-results/feature-checks.json'),JSON.stringify({report,menuActionsExercised:[...exercisedActions].sort(),runtimeErrors:errors,headset:'Not tested on physical hardware'},null,2));
}
if(report.some(result=>result.status!=='PASS'))process.exitCode=1;
