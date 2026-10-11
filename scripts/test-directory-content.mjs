import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const modules=new Map();
function load(file){if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);vm.runInNewContext(ts.transpileModule(readFileSync(`${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:load});return exports;}
const {uniqueDirectoryItems}=load('app/lib/directory-items');
const items=[{href:'/auto/vw/golf-iv',name:'Golf IV'},{href:' /AUTO/VW/GOLF-IV ',name:'Repeated Golf IV'},{href:'/auto/vw/golf-v',name:'Golf V'},{href:'',name:'Invalid destination'}];
const result=uniqueDirectoryItems(items,item=>item.href);
assert.equal(result.length,2);assert.equal(result[0],items[0]);assert.equal(result[1],items[2]);assert.equal(items.length,4,'Source data remains intact');
const {getGroupSeoCopy,getGroupItemSeoCopy,getProducerSeoCopy}=load('app/lib/seo-copy');
for(const content of [getGroupSeoCopy('Гальмівна система',12),getGroupSeoCopy('Тестовий розділ',0),getGroupItemSeoCopy({label:'Тестова деталь',groupLabel:'Тестовий розділ',productCount:0,producersCount:0,childrenCount:0}),getProducerSeoCopy('TestBrand',3,['Щітки склоочисника'])]){
 const text=[content.intro,...content.paragraphs].join(' ');
 assert(!/закриває запити|пошуку в Google|пов.язані запити|без ризику помилки/.test(text),'Descriptions serve the visitor without SEO jargon or compatibility guarantees');
 assert.equal(new Set(content.paragraphs).size,content.paragraphs.length);
}
const producer=getProducerSeoCopy('TestBrand',3,['Щітки склоочисника']);assert(producer.paragraphs.some(text=>text.includes('Щітки склоочисника')));assert(!producer.paragraphs.some(text=>text.includes('амортизатор')),'Unknown brands only describe their actual groups');
console.log('Directory destinations and visitor-focused copy: PASS');
