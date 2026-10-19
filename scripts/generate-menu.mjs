import fs from 'node:fs';
import ts from 'typescript';
// Extract metadata only; callbacks are not executed and imports are intentionally omitted.
const source=fs.readFileSync('src/lab-actions.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/^import .+;$/gm,'');
const {createLabActions}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const categories=createLabActions({camera(){},summary(){},pauseAll(){},clearWorkspace(){}});
fs.writeFileSync('docs/controller-menu.json',JSON.stringify(categories.map(category=>({id:category.id,label:category.label,actions:category.actions.map(action=>({id:action.id,label:action.label,pageOnly:!!action.desktopOnly,confirmationRequired:!!action.confirm}))})),null,2)+'\n');
console.log(categories.length+' categories, '+categories.reduce((sum,category)=>sum+category.actions.length,0)+' actions');
