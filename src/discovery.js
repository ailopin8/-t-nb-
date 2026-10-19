// Exact binary identities, independent of observer language.
export function key(bits) {
  if (bits.length !== 1000 || Array.from(bits).some(v => v !== 0 && v !== 1)) throw Error('Expected exactly 1000 binary cells');
  return Array.from(bits).join('');
}
export function describe(bits, previous = bits) {
  key(bits); key(previous);
  let population = 0, transitions = 0, changes = 0, components = 0, largest = 0;
  const seen = new Uint8Array(1000);
  const neighbors = i => {
    const x=i%10, y=Math.floor(i/10)%10, z=Math.floor(i/100);
    return [(x+1)%10+10*y+100*z,(x+9)%10+10*y+100*z,x+10*((y+1)%10)+100*z,x+10*((y+9)%10)+100*z,x+10*y+100*((z+1)%10),x+10*y+100*((z+9)%10)];
  };
  for(let i=0;i<1000;i++) {
    population += bits[i]; changes += bits[i]^previous[i];
    for(const j of neighbors(i)) transitions += bits[i]^bits[j];
    if(!bits[i] || seen[i]) continue;
    components++; const stack=[i]; seen[i]=1; let size=0;
    while(stack.length) { const j=stack.pop(); size++; for(const n of neighbors(j)) if(bits[n]&&!seen[n]) {seen[n]=1;stack.push(n);} }
    largest=Math.max(largest,size);
  }
  return {population, transitions:transitions/2, components, largest, changedBits:changes, stability:1-changes/1000};
}
export function validate(ticks, address, tick, mode) {
  if(!Number.isInteger(ticks)||ticks<1||ticks>128) throw Error('Ticks must be an integer from 1 to 128');
  if(!Number.isInteger(address)||address<0||address>999) throw Error('Address must be an integer from 0 to 999');
  if(!Number.isInteger(tick)||tick<0||tick>=ticks) throw Error('Intervention tick must be from 0 to ticks minus 1');
  if(!['none','flip','uncouple'].includes(mode)) throw Error('Unknown intervention');
}
export function analyze(VM, program, config, initialBits) {
  if(initialBits!==undefined&&(typeof initialBits!=='string'||!/^[01]{1000}$/.test(initialBits)))throw Error('Expected 1000 workflow seed bits');
  const {ticks,address,tick,mode}=config; validate(ticks,address,tick,mode);
  const baseline=new VM(program), intervention=new VM(program,mode!=='uncouple');
  if(initialBits!==undefined)for(const vm of [baseline,intervention])vm.states[0].bits=Uint8Array.from(initialBits,Number);
  const histories={baseline:[],intervention:[]};
  const signatures={baseline:[],intervention:[]};
  for(let t=0;t<=ticks;t++) {
    if(mode==='flip'&&t===tick) intervention.states[0].bits[address]^=1;
    for(const [name,vm] of [['baseline',baseline],['intervention',intervention]]) {
      signatures[name].push(JSON.stringify({states:vm.states.map(s=>key(s.bits)),queue:vm.queue}));
      histories[name].push(vm.states.map(s=>({matrix:s.name,bits:key(s.bits)})));
    }
    if(t<ticks) {baseline.step();intervention.step();}
  }
  const registry=new Map(); const rows=[];
  for(const name of ['baseline','intervention']) {
    histories[name].forEach((states,t)=>states.forEach(s=>{
      const identity=s.bits; let entry=registry.get(identity);
      if(!entry) {entry={id:'P'+String(registry.size+1).padStart(3,'0'),identity,occurrences:[],runs:new Set()};registry.set(identity,entry);}
      entry.occurrences.push({run:name,tick:t,matrix:s.matrix});entry.runs.add(name);
    }));
    for(const s of histories[name][ticks]) {
      const prior=histories[name][ticks-1].find(v=>v.matrix===s.matrix);
      // Period is certified only when the COMPLETE VM state repeats. A local bit
      // recurrence alone cannot establish a dynamical period under coupling.
      rows.push({run:name,matrix:s.matrix,...describe(Uint8Array.from(s.bits,Number),Uint8Array.from(prior.bits,Number))});
    }
  }
  const differences=histories.baseline.map((states,t)=>({tick:t,matrices:states.map(s=>({matrix:s.matrix,differentBits:Array.from(s.bits).reduce((n,b,i)=>n+Number(b!==histories.intervention[t].find(v=>v.matrix===s.matrix).bits[i]),0)}))}));
  const patterns=Array.from(registry.values()).map(p=>({id:p.id,bits:p.identity,occurrences:p.occurrences,crossRunCount:p.runs.size,classification:p.occurrences.length>1?'recurring exact state':'single observation',...describe(Uint8Array.from(p.identity,Number))}));
  const periodicity=Object.fromEntries(['baseline','intervention'].map(name=>{
    const end=signatures[name][ticks]; let period=null;
    const start=name==='intervention'&&mode==='flip'?tick:0;
    for(let t=ticks-1;t>=start;t--) if(signatures[name][t]===end) {period=ticks-t;break;}
    return [name,period];
  }));
  return {initialBits:initialBits??null,periodicity,format:'atunbi.g9.discovery.v1',source:program.source,config,shape:[10,10,10],boundary:'periodic',connectivity:6,ruleAxis:'x',rows,patterns,differences,histories};
}
