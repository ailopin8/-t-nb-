export type SignalKind = 'command' | 'snapshot' | 'binary' | 'source' | 'evidence' | 'annotation';
export type Payload = Record<string, unknown>;
export type FlowNode = {
  id: string; label: string;
  inputs: Record<string, SignalKind>; outputs: Record<string, SignalKind>;
  receive?: (port: string, payload: Payload) => void;
};
export type FlowEdge = {id: string; from: string; output: string; to: string; input: string; enabled: boolean; delayed: boolean};
export type Delivery = {sequence: number; tick: number; edge: string; from: string; to: string; port: string; status: 'delivered' | 'failed'; summary: string};
type Message = {edge: string; payload: Payload};

function validate(kind: SignalKind, payload: Payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Signals require an object payload.');
  if (kind === 'command' && typeof payload.target !== 'string') throw Error('Commands need a target.');
  if (kind === 'source' && typeof payload.source !== 'string') throw Error('Source signals need source text.');
  if (kind === 'binary' && (typeof payload.bits !== 'string' || !/^[01]{1000}$/.test(payload.bits))) throw Error('Binary signals require exactly 1000 bits.');
  if (kind === 'annotation' && typeof payload.text !== 'string') throw Error('Annotations need text.');
  const json=JSON.stringify(payload,(_key,value)=>{
    if(typeof value==='number'&&!Number.isFinite(value))throw Error('Signals cannot contain non-finite values.');
    if(typeof value==='function'||typeof value==='bigint')throw Error('Signals must be serializable.');
    return value;
  });
  if(json.length>4_000_000)throw Error('Signal exceeds the 4 MB limit.');
}

export class FlowRuntime {
  nodes = new Map<string, FlowNode>();
  edges = new Map<string, FlowEdge>();
  trace: Delivery[] = [];
  counts = new Map<string, number>();
  tick = 0;
  revision = 0;
  private sequence = 0;
  private pending: Message[] = [];
  private queue: Message[] = [];
  private draining = false;
  register(node: FlowNode) {
    if(this.nodes.has(node.id))throw Error('Duplicate module: '+node.id);
    this.nodes.set(node.id,node);this.revision++;
    return () => {this.nodes.delete(node.id);for(const [id,edge] of this.edges)if(edge.from===node.id||edge.to===node.id)this.edges.delete(id);this.revision++;};
  }
  connect(edge: FlowEdge) {
    if(this.edges.size>=128)throw Error('Workflow supports at most 128 edges.');
    if(this.edges.has(edge.id))throw Error('Duplicate edge: '+edge.id);
    this.checkEdge(edge);
    this.edges.set(edge.id,{...edge});this.revision++;
  }
  private checkEdge(edge: FlowEdge, existing: FlowEdge[] = [...this.edges.values()]) {
    const from=this.nodes.get(edge.from),to=this.nodes.get(edge.to);
    if(!from||!to)throw Error('Both endpoint modules must exist.');
    const output=from.outputs[edge.output],input=to.inputs[edge.input];
    if(!output||!input||output!==input)throw Error('Choose compatible output and input port types.');
    if(edge.enabled&&!edge.delayed) {
      const visited=new Set<string>();const todo=[edge.to];
      while(todo.length) {
        const id=todo.pop()!;if(id===edge.from)throw Error('Feedback loops need at least one delayed edge.');
        if(visited.has(id))continue;visited.add(id);
        for(const candidate of existing)if(candidate.id!==edge.id&&candidate.enabled&&!candidate.delayed&&candidate.from===id)todo.push(candidate.to);
      }
    }
  }
  enable(id: string, enabled: boolean) {
    const old=this.edges.get(id);if(!old)throw Error('Unknown edge.');
    const next={...old,enabled};this.checkEdge(next);this.edges.set(id,next);if(!enabled){this.pending=this.pending.filter(message=>message.edge!==id);this.queue=this.queue.filter(message=>message.edge!==id);}this.revision++;
  }
  remove(id: string) {if(!this.edges.delete(id))throw Error('Unknown edge.');this.pending=this.pending.filter(message=>message.edge!==id);this.queue=this.queue.filter(message=>message.edge!==id);this.revision++;}
  emit(nodeId: string, port: string, payload: Payload) {
    const kind=this.nodes.get(nodeId)?.outputs[port];if(!kind)throw Error('Unknown output port.');
    validate(kind,payload);
    let recipients=0;
    for(const edge of this.edges.values())if(edge.enabled&&edge.from===nodeId&&edge.output===port) {
      const message={edge:edge.id,payload:structuredClone(payload)};recipients++;
      if(edge.delayed)this.pending.push(message);else this.queue.push(message);
    }
    if(this.pending.length+this.queue.length>512){this.pending=[];this.queue=[];throw Error('Signal queue limit reached.');}
    if(!this.draining)this.drain();
    return recipients;
  }
  advance() {
    this.tick++;
    this.queue.push(...this.pending);this.pending=[];
    if(!this.draining)this.drain();
  }
  private drain() {
    this.draining=true;let deliveries=0;
    try {
      while(this.queue.length) {
        if(++deliveries>512){this.queue=[];throw Error('Delivery limit reached.');}
        const message=this.queue.shift()!,edge=this.edges.get(message.edge);
        if(!edge?.enabled)continue;
        const receiver=this.nodes.get(edge.to);if(!receiver)continue;
        try {
          validate(receiver.inputs[edge.input],message.payload);
          receiver.receive?.(edge.input,structuredClone(message.payload));
          this.counts.set(edge.id,(this.counts.get(edge.id)||0)+1);
          this.trace.push({sequence:++this.sequence,tick:this.tick,edge:edge.id,from:edge.from,to:edge.to,port:edge.input,status:'delivered',summary:Object.keys(message.payload).join(', ')});
        } catch(error) {
          this.trace.push({sequence:++this.sequence,tick:this.tick,edge:edge.id,from:edge.from,to:edge.to,port:edge.input,status:'failed',summary:String(error)});
          throw error;
        } finally {this.trace=this.trace.slice(-160);this.revision++;}
      }
    } catch(error) {this.queue=[];throw error;}
    finally {this.draining=false;}
  }
  snapshot() {return {format:'atunbi.workflow.v1',edges:[...this.edges.values()].map(edge=>({...edge}))};}
  restore(value: unknown) {
    if(!value||typeof value!=='object'||(value as {format?:unknown}).format!=='atunbi.workflow.v1'||!Array.isArray((value as {edges?:unknown}).edges))throw Error('Unsupported workflow file.');
    const edges=(value as {edges:FlowEdge[]}).edges;
    if(edges.length>128)throw Error('Workflow supports at most 128 edges.');
    const accepted:FlowEdge[]=[];const ids=new Set();
    for(const edge of edges) {
      if(!edge||typeof edge.id!=='string'||ids.has(edge.id)||typeof edge.enabled!=='boolean'||typeof edge.delayed!=='boolean')throw Error('Invalid or duplicate edge.');
      this.checkEdge(edge,accepted);ids.add(edge.id);accepted.push({...edge});
    }
    this.edges=new Map(accepted.map(edge=>[edge.id,edge]));this.pending=[];this.queue=[];this.revision++;
  }
}
