export type AlgorithmLinks = {feedback:boolean; pid:boolean; oscillator:boolean; logistic:boolean; diffusion:boolean; xor:boolean};
export type CompositionConfig = {target:number; kp:number; ki:number; kd:number; dt:number; limit:number; decay:number; seed:number; rule:number; r:number; links:AlgorithmLinks};
export type PIDMemory = {integral:number; derivative:number; previous:number|null};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export const quantize=(value:number)=>Math.round(value*65536)/65536;
export const word=(value:number)=>(Math.round(value*65536)>>>0).toString(2).padStart(32,'0');
export const defaultConfig:CompositionConfig={target:500,kp:.7,ki:.08,kd:.12,dt:1,limit:.128,decay:.01,seed:42,rule:90,r:3.7,links:{feedback:true,pid:true,oscillator:false,logistic:false,diffusion:false,xor:false}};
export function validateConfig(config:CompositionConfig) {
  for(const [name,min,max] of [['target',0,1000],['kp',0,10],['ki',0,2],['kd',0,5],['dt',.01,10],['limit',.001,.5],['decay',0,.2],['seed',0,4294967295],['rule',0,255],['r',0,4]] as const) {
    const value=config[name];if(!Number.isFinite(value)||value<min||value>max)throw Error(name+' must be from '+min+' to '+max+'.');
  }
  for(const name of ['target','seed','rule'] as const)if(!Number.isInteger(config[name]))throw Error(name+' must be a whole number.');
  if(!config.links||Object.keys(defaultConfig.links).some(key=>typeof config.links[key as keyof AlgorithmLinks]!=='boolean'))throw Error('All algorithm links require an enabled state.');
}
export function pidStep(measured:number,target:number,config:CompositionConfig,memory:PIDMemory) {
  const error=quantize(target-measured);
  const rawDerivative=memory.previous===null?0:-(measured-memory.previous)/config.dt;
  const alpha=config.dt/(config.dt+.25);
  const derivative=quantize(memory.derivative+alpha*(rawDerivative-memory.derivative));
  let integral=quantize(clamp(memory.integral+error*config.dt,-4,4));
  let raw=config.kp*error+config.ki*integral+config.kd*derivative;
  // Conditional integration prevents further windup while output is saturated.
  if((raw>config.limit&&error>0)||(raw< -config.limit&&error<0)) {
    integral=memory.integral;raw=config.kp*error+config.ki*integral+config.kd*derivative;
  }
  const control=quantize(clamp(raw,-config.limit,config.limit));
  return {error,control,saturated:Math.abs(raw)>config.limit,memory:{integral,derivative,previous:measured},registers:{error:word(error),integral:word(integral),derivative:word(derivative),control:word(control)}};
}
function validateBits(bits:Uint8Array) {if(bits.length!==1000||bits.some(bit=>bit!==0&&bit!==1))throw Error('Matrix must contain exactly 1000 bits.');}
const index=(x:number,y:number,z:number)=>(x+10)%10+10*((y+10)%10)+100*((z+10)%10);
export function neighbors(i:number) {const x=i%10,y=Math.floor(i/10)%10,z=Math.floor(i/100);return [index(x-1,y,z),index(x+1,y,z),index(x,y-1,z),index(x,y+1,z),index(x,y,z-1),index(x,y,z+1)];}
export class CompositionEngine {
  config:CompositionConfig;
  bits:Uint8Array;
  readonly initial:Uint8Array;
  tick=0;
  phase=0;
  logistic=.413;
  memory:PIDMemory={integral:0,derivative:0,previous:null};
  order:number[];
  last:{error:number;control:number;saturated:boolean;registers:Record<string,string>}={error:0,control:0,saturated:false,registers:{}};
  target:number;
  constructor(config:CompositionConfig=structuredClone(defaultConfig),initial?:Uint8Array) {
    validateConfig(config);this.config=structuredClone(config);this.target=config.target;
    let random=config.seed>>>0;
    const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
    this.order=Array.from({length:1000},(_,i)=>i);
    for(let i=999;i>0;i--){const j=Math.floor(next()*(i+1));[this.order[i],this.order[j]]=[this.order[j],this.order[i]];}
    this.bits=initial?initial.slice():new Uint8Array(1000);
    if(!initial)for(const address of this.order.slice(0,120))this.bits[address]=1;
    validateBits(this.bits);this.initial=this.bits.slice();
  }
  step() {
    validateConfig(this.config);
    const old=this.bits;let next=old.slice();const links=this.config.links;
    this.tick++;
    this.phase=quantize((this.phase+.17*this.config.dt)%(Math.PI*2));
    this.logistic=quantize(this.config.r*this.logistic*(1-this.logistic));
    this.target=Math.round(clamp(this.config.target+(links.oscillator?100*Math.sin(this.phase):0)+(links.logistic?120*(this.logistic-.5):0),0,1000));
    if(links.xor)for(let z=0;z<10;z++)for(let y=0;y<10;y++)for(let x=0;x<10;x++) {
      const triple=(old[index(x-1,y,z)]<<2)|(old[index(x,y,z)]<<1)|old[index(x+1,y,z)];next[index(x,y,z)]=(this.config.rule>>>triple)&1;
    }
    if(links.diffusion) {
      const before=next.slice();for(let i=0;i<1000;i++)next[i]=(.55*before[i]+.45*neighbors(i).reduce((sum,j)=>sum+before[j],0)/6)>=.5?1:0;
    }
    let loss=Math.floor(next.reduce((sum,bit)=>sum+bit,0)*this.config.decay);
    for(let k=0;k<1000&&loss>0;k++){const i=this.order[(k+this.tick*17)%1000];if(next[i]){next[i]=0;loss--;}}
    const measured=next.reduce((sum,bit)=>sum+bit,0)/1000;
    if(links.feedback) {
      const result=pidStep(measured,this.target/1000,this.config,this.memory);this.last=result;this.memory=result.memory;
    } else {this.last={error:this.target/1000-measured,control:0,saturated:false,registers:{error:word(this.target/1000-measured),control:word(0)}};}
    if(links.pid&&links.feedback) {
      let budget=Math.round(Math.abs(this.last.control)*1000);
      const desired=this.last.control>=0?1:0;
      const phaseOffset=links.oscillator?Math.floor(this.phase/(2*Math.PI)*1000):0;
      for(let k=0;k<1000&&budget>0;k++) {
        const address=this.order[(k+this.tick*11+phaseOffset)%1000];if(next[address]!==desired){next[address]=desired;budget--;}
      }
    }
    validateBits(next);this.bits=next;return this.snapshot();
  }
  snapshot() {return {tick:this.tick,bits:Array.from(this.bits).join(''),population:this.bits.reduce((sum,bit)=>sum+bit,0),target:this.target,error:this.last.error,control:this.last.control,saturated:this.last.saturated,registers:this.last.registers};}
}
export function compareComposition(config:CompositionConfig,initial:Uint8Array,ticks=64) {
  if(!Number.isInteger(ticks)||ticks<1||ticks>128)throw Error('Experiment ticks must be from 1 to 128.');
  const controlled=new CompositionEngine(config,initial),baselineConfig=structuredClone(config);baselineConfig.links.pid=false;
  const baseline=new CompositionEngine(baselineConfig,initial);
  const trajectory=Array.from({length:ticks},()=>({controlled:controlled.step(),baseline:baseline.step()}));
  const mae=(arm:'controlled'|'baseline')=>trajectory.reduce((sum,row)=>sum+Math.abs(row[arm].target-row[arm].population),0)/ticks;
  return {format:'atunbi.composition.v1',config:structuredClone(config),initial:Array.from(initial).join(''),ticks,trajectory,meanAbsoluteError:{controlled:mae('controlled'),baseline:mae('baseline')},finalHamming:controlled.bits.reduce((sum,bit,i)=>sum+(bit^baseline.bits[i]),0)};
}
