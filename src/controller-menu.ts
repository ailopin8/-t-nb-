export type MenuContext = 'desktop' | 'xr';
export type LabAction = {
  id: string;
  label: string;
  run: () => string | void;
  available?: () => string | null;
  desktopOnly?: boolean;
  desktopReason?: string;
  confirm?: string;
};
export type MenuCategory = {id: string; label: string; description: string; actions: LabAction[]};
export type MenuEntry = {id: string; label: string; enabled: boolean; reason: string | null};

/** The same state machine drives DOM buttons and WebXR ray/stick selections. */
export class ControllerMenu {
  category: string | null = null;
  page = 0;
  selected = 0;
  pending: LabAction | null = null;
  message = 'Select a category. The spatial scene shows G6; other runtimes remain independent.';
  readonly pageSize = 6;
  constructor(public categories: MenuCategory[], public context: MenuContext = 'desktop') {}
  get title() {
    return this.pending ? 'Confirm action' : this.categories.find(c => c.id === this.category)?.label || 'Controller menu';
  }
  private allEntries(): MenuEntry[] {
    if (this.pending) return [{id:'confirm',label:'Confirm',enabled:true,reason:null},{id:'cancel',label:'Cancel',enabled:true,reason:null}];
    if (!this.category) return this.categories.map(c => ({id:c.id,label:c.label,enabled:true,reason:null}));
    return (this.categories.find(c => c.id === this.category)?.actions || []).map(action => {
      const reason = this.context === 'xr' && action.desktopOnly ? (action.desktopReason || 'Use the page for text entry, downloads or file selection.') : action.available?.() || null;
      return {id:action.id,label:action.label,enabled:!reason,reason};
    });
  }
  get pageCount() { return Math.max(1,Math.ceil(this.allEntries().length/this.pageSize)); }
  get entries() {
    this.page = Math.max(0,Math.min(this.page,this.pageCount-1));
    return this.allEntries().slice(this.page*this.pageSize,(this.page+1)*this.pageSize);
  }
  turnPage(direction: number) {
    this.page = (this.page+direction+this.pageCount)%this.pageCount; this.selected=0;
  }
  move(direction: number) {
    const entries=this.entries;
    this.selected=(this.selected+direction+entries.length)%Math.max(1,entries.length);
  }
  back() {
    if (this.pending) {this.pending=null;this.message='Action cancelled.';}
    else {this.category=null;this.message='Select a category.';}
    this.page=0;this.selected=0;
  }
  activate(id: string) {
    if (id === 'back') {this.back();return;}
    if (id === 'previous') {this.turnPage(-1);return;}
    if (id === 'next') {this.turnPage(1);return;}
    if (this.pending) {
      const action=this.pending;
      if (id==='cancel') {this.back();return;}
      if (id==='confirm') {this.pending=null;this.execute(action);}
      return;
    }
    if (!this.category) {
      const category=this.categories.find(c=>c.id===id);
      if(category) {this.category=id;this.page=0;this.selected=0;this.message=category.description;}
      return;
    }
    const action=this.categories.find(c=>c.id===this.category)?.actions.find(a=>a.id===id);
    if(!action)return;
    const entry=this.allEntries().find(e=>e.id===id)!;
    if(!entry.enabled) {this.message=entry.reason!;return;}
    if(action.confirm) {this.pending=action;this.page=0;this.selected=0;this.message=action.confirm;return;}
    this.execute(action);
  }
  private execute(action: LabAction) {
    // Recheck guards after confirmation: another input surface may have changed state.
    const reason=(this.context==='xr'&&action.desktopOnly) ? (action.desktopReason || 'Use the page for this action.') : action.available?.();
    if(reason) {this.message=reason;return;}
    try {this.message=action.run() || action.label+' completed.';}
    catch(error) {this.message='Action failed: '+(error instanceof Error?error.message:String(error));}
  }
}
