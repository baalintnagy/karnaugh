import {names,orderNumber,expression,sop,matches} from './logic.js';
import {mapSvg,circuitSvg,timingSvg,colors,groupOutline} from './svg.js';
const $=id=>document.getElementById(id);
let n=3,values=[0,1,1,1,0,0,1,1],result=null,form='minimal',worker=null,revision=0,svg='';
let diagramRevision=0;
let formulaSource='';
const zoomLevels={map:100,diagram:100,timing:100};
function applyZoom(id){
  const image=$(id).querySelector('svg');
  if(!image)return;
  const box=image.viewBox.baseVal,scale=zoomLevels[id]/100;
  Object.assign(image.style,{width:`${box.width*scale}px`,height:`${box.height*scale}px`,minWidth:'0',maxWidth:'none',maxHeight:'none',flexShrink:'0'});
}
function setupZoom(){
  for(const [id,name] of [['map','Karnaugh map'],['diagram','Logic circuit'],['timing','Timing diagram']]){
    const control=document.createElement('div');control.className='zoom-control';
    control.innerHTML=`<label for="${id}-zoom">Zoom<span class="sr-only"> ${name}</span></label><input id="${id}-zoom" type="range" min="25" max="200" step="5" value="100" aria-valuetext="100 percent"><output id="${id}-zoom-value" for="${id}-zoom">100%</output><button class="text-button" aria-label="Reset ${name.toLowerCase()} zoom">Reset</button>`;
    $(id).before(control);
    const slider=control.querySelector('input'),output=control.querySelector('output');
    const change=()=>{zoomLevels[id]=Number(slider.value);output.textContent=`${slider.value}%`;slider.setAttribute('aria-valuetext',`${slider.value} percent`);applyZoom(id)};
    slider.addEventListener('input',change);control.querySelector('button').onclick=()=>{slider.value='100';change()};
  }
}
const descriptions={minimal:['Minimum sum of products','Exact cover: fewest product terms, then fewest literals. Loops on the map correspond to these terms.'],dnf:['Canonical disjunctive normal form','One product term for every row whose output is 1. AND is juxtaposition; OR is addition.'],cnf:['Canonical conjunctive normal form','One sum clause for every row whose output is 0. AND is juxtaposition; OR is addition.'],nand:['NAND-only implementation','The minimized sum of products transformed with De Morgan’s law. A repeated input implements inversion.'],nor:['NOR-only implementation','The minimized product of sums transformed with De Morgan’s law. A repeated input implements inversion.']};
function table(){
  $('truth-table').querySelector('thead').innerHTML=`<tr><th scope="col">i</th>${names(n).map(v=>`<th scope="col">${v}</th>`).join('')}<th scope="col">f</th></tr>`;
  $('truth-table').querySelector('tbody').innerHTML=values.map((v,i)=>`<tr><td>${i}</td>${names(n).map((_,j)=>`<td>${(i>>(n-1-j))&1}</td>`).join('')}<td><button class="bit ${v===1?'on':v==='X'?'dont-care':''}" data-index="${i}" aria-label="Row ${i}, output ${v==='X'?'X (don’t care)':v}. Cycle 0, 1, X.">${v}</button></td></tr>`).join('');
  $('row-count').textContent=`${values.length} rows`;$('variables').value=n;$('minus').disabled=n===1;$('plus').disabled=n===8;
}
const mathSource=source=>'`'+source+'`';
const legendResize=new ResizeObserver(entries=>{
  for(const {target} of entries){
    const border=target.querySelector('.legend-outline rect');
    if(border){border.setAttribute('width',Math.max(0,target.offsetWidth-3));border.setAttribute('height',Math.max(0,target.offsetHeight-3))}
  }
});
function highlightTerms(indices=[]){
  const selected=new Set(indices),cubes=result?.ones||[];
  $('map').classList.toggle('has-term-highlight',selected.size>0);
  $('map').querySelectorAll('[data-map-group]').forEach(group=>group.classList.toggle('term-highlight',selected.has(Number(group.dataset.mapGroup)-1)));
  $('map').querySelectorAll('.map-cell').forEach(cell=>cell.classList.toggle('term-highlight',indices.some(i=>matches(cubes[i],Number(cell.dataset.index)))));
  $('legend').querySelectorAll('.legend-item').forEach((item,i)=>item.classList.toggle('term-highlight',selected.has(i)));
}
function map(){
  $('map').classList.remove('has-term-highlight');
  $('map').innerHTML=mapSvg(n,values,result?.ones||[]);applyZoom('map');
  $('map').querySelectorAll('.map-cell').forEach(cell=>{
    const highlight=()=>highlightTerms((result?.ones||[]).flatMap((cube,i)=>matches(cube,Number(cell.dataset.index))?[i]:[]));
    cell.addEventListener('mouseenter',highlight);cell.addEventListener('mouseleave',()=>highlightTerms());
    cell.addEventListener('focus',highlight);cell.addEventListener('blur',()=>highlightTerms());
  });
  try{window.MathJax?.typesetClear?.([$('legend')])}catch{}
  $('legend').querySelectorAll('.legend-item').forEach(item=>legendResize.unobserve(item));
  $('legend').replaceChildren();
  if(result)result.ones.forEach((c,i)=>{
    const item=document.createElement('span');item.className='legend-item';
    item.tabIndex=0;item.setAttribute('aria-label',`Highlight term ${i+1} on the Karnaugh map`);
    item.addEventListener('mouseenter',()=>highlightTerms([i]));item.addEventListener('mouseleave',()=>highlightTerms());
    item.addEventListener('focus',()=>highlightTerms([i]));item.addEventListener('blur',()=>highlightTerms());
    const dot=document.createElement('span'),outline=groupOutline(i);
    dot.title=outline.name+' outline';
    dot.innerHTML=`<svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true"><path d="M2,6 H30" fill="none" stroke="${colors[i%colors.length]}" stroke-width="2" ${outline.attributes}/></svg>`;
    const term=document.createElement('span');term.textContent=mathSource(expression(sop(n,[c])));
    const border=document.createElement('span');
    border.innerHTML=`<svg class="legend-outline" aria-hidden="true"><rect x="1.5" y="1.5" rx="5" fill="none" stroke="${colors[i%colors.length]}" stroke-width="2" ${outline.attributes}/></svg>`;
    item.append(dot,term,border);$('legend').append(item);legendResize.observe(item);
  });
}
function palette(){const style=getComputedStyle(document.documentElement);return Object.fromEntries(['text','muted','line','accent','bg'].map(k=>[k,style.getPropertyValue('--'+(k==='bg'?'panel':k)).trim()]))}
function timing(){ $('timing').innerHTML=timingSvg(n,values,palette());applyZoom('timing') }
let mathQueue=Promise.resolve();
function typeset(){
  mathQueue=mathQueue.then(async()=>{
    if(window.MathJax?.startup?.promise){await window.MathJax.startup.promise;await window.MathJax.typesetPromise?.([$('formula'),$('legend'),$('order-note')])}
  }).catch(()=>{/* Source remains readable if the CDN is unavailable. */});
  return mathQueue;
}
async function renderForm(){
  const drawing=++diagramRevision;
  $('expression-content').setAttribute('aria-labelledby','tab-'+form);
  document.querySelectorAll('[data-form]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.form===form));b.tabIndex=b.dataset.form===form?0:-1});
  $('form-name').textContent=descriptions[form][0];$('form-note').textContent=descriptions[form][1];
  if(values.includes('X')&&form==='dnf')$('form-name').textContent='Specified-row DNF (X → 0)';
  if(values.includes('X')&&form==='cnf')$('form-name').textContent='Specified-row CNF (X → 1)';
  if(values.includes('X'))$('form-note').textContent+=form==='dnf'?' Only specified 1 rows are included; X rows complete to 0.':form==='cnf'?' Only specified 0 rows are included; X rows complete to 1.':' X rows may be either value. This circuit is one valid completion; different forms may choose different values for X.';
  $('copy').disabled=!result;$('download').disabled=true;
  try{window.MathJax?.typesetClear?.([$('formula')])}catch{}
  if(!result){$('formula').textContent='Computing exact cover…';formulaSource='';$('diagram').replaceChildren();return}
  const formulaTree=result.forms[form];
  formulaSource='f = '+expression(formulaTree);
  // A bar over the entire universal-gate formula is an unbreakable box.
  // Use equivalent prefix negation for that outer operation in the display.
  if(['AND','OR','NAND','NOR'].includes(formulaTree.type)){
    const negated=['NAND','NOR'].includes(formulaTree.type),sum=['OR','NOR'].includes(formulaTree.type);
    const chunks=[negated?'f = not':'f =',...(negated?['(']:[]),...formulaTree.children.map((child,i)=>{
      const source=expression(child),term=['INPUT','CONST','NOT'].includes(child.type)?source:'('+source+')';
      return (i&&sum?'+ ':'')+term;
    }),...(negated?[')']:[])];
    $('formula').replaceChildren(...chunks.map((source,i)=>{const chunk=document.createElement('span');chunk.className='formula-chunk'+(negated&&(i===1||i===chunks.length-1)?' formula-outer-parenthesis':'');chunk.textContent=mathSource(source);return chunk}));
  }else $('formula').textContent=mathSource(formulaSource);
  typeset();$('diagram').textContent='Routing circuit wires…';
  try{const rendered=await circuitSvg(result.forms[form],palette(),n);if(drawing!==diagramRevision)return;svg=rendered;$('diagram').innerHTML=svg;applyZoom('diagram');$('download').disabled=false}catch(error){if(drawing!==diagramRevision)return;$('diagram').textContent='Circuit layout failed. Reload to retry.';console.error(error)}
}
function update(){
  const id=++revision;worker?.terminate();result=null;table();map();timing();renderForm();
  const unspecified=values.filter(v=>v==='X').length;
  $('order').textContent=orderNumber(values)??'Partially specified';
  try{window.MathJax?.typesetClear?.([$('order-note')])}catch{}
  $('order-note').textContent=unspecified?`${unspecified} don't-care row${unspecified===1?'':'s'} · no unique function order number`:mathSource('N = sum f(i) 2^i')+' / row 0 means the least significant bit';
  $('dont-cares').textContent=unspecified;$('ones').textContent=values.filter(v=>v===1).length;$('groups').textContent='…';$('status').textContent='Finding exact minimum…';
  try{worker=new Worker(new URL('./solver-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(id!==revision)return;if(data.error){fail(data.error);return}result=data.result;$('groups').textContent=result.ones.length;$('status').textContent='Exact solution';map();renderForm();worker.terminate()};worker.onerror=()=>fail('Solver could not start. Serve this folder over HTTP.');worker.postMessage({n,values})}catch(error){fail(error.message)}
}
function fail(message){$('status').textContent=message;$('formula').textContent='Unable to solve. Reload the page or use a local HTTP server.';$('groups').textContent='–'}
function setN(value){const next=Math.max(1,Math.min(8,Math.round(Number(value)||1)));if(next===n){$('variables').value=n;return}n=next;values=Array.from({length:2**n},(_,i)=>values[i]||0);$('preset').value='';update()}
function toggle(i){const focused=document.activeElement?.dataset?.index===String(i),inTable=$('truth-table').contains(document.activeElement);values[i]=values[i]===0?1:values[i]===1?'X':0;$('preset').value='';update();if(focused)(inTable?$('truth-table'):$('map')).querySelector(`[data-index="${i}"]`)?.focus()}
$('variables').addEventListener('input',e=>{if(e.target.value!==''&&Number.isInteger(+e.target.value)&&+e.target.value>=1&&+e.target.value<=8)setN(e.target.value)});
$('variables').addEventListener('change',e=>setN(e.target.value));$('minus').onclick=()=>setN(n-1);$('plus').onclick=()=>setN(n+1);
$('truth-table').onclick=e=>{const b=e.target.closest('[data-index]');if(b)toggle(+b.dataset.index)};
$('map').onclick=e=>{const cell=e.target.closest('[data-index]');if(cell)toggle(+cell.dataset.index)};
$('map').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const cell=e.target.closest('[data-index]');if(cell){e.preventDefault();const i=+cell.dataset.index;toggle(i);$('map').querySelector(`[data-index="${i}"]`)?.focus()}}};
$('clear').onclick=()=>{values.fill(0);$('preset').value='';update()};$('invert').onclick=()=>{values=values.map(v=>v==='X'?'X':1-v);$('preset').value='';update()};$('random').onclick=()=>{values=values.map(()=>Math.random()<.5?0:1);$('preset').value='';update()};
$('preset').onchange=e=>{const p=e.target.value;if(!p)return;values=values.map((_,i)=>{const bits=i.toString(2).split('1').length-1;return p==='majority'?+(bits>n/2):p==='parity'?bits%2:(i>>(n-1))&1});update()};
document.querySelector('.tabs').onclick=e=>{const button=e.target.closest('[data-form]');if(button){form=button.dataset.form;renderForm()}};
document.querySelector('.tabs').onkeydown=e=>{const buttons=[...document.querySelectorAll('[data-form]')];const i=buttons.indexOf(document.activeElement);if(i<0)return;let next;if(e.key==='ArrowRight')next=(i+1)%buttons.length;if(e.key==='ArrowLeft')next=(i+buttons.length-1)%buttons.length;if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;if(next!==undefined){e.preventDefault();form=buttons[next].dataset.form;renderForm();buttons[next].focus()}};
function themeLabel(){$('theme').setAttribute('aria-label',`Switch to ${document.documentElement.dataset.theme==='dark'?'light':'dark'} theme`);$('theme').textContent=document.documentElement.dataset.theme==='dark'?'☼':'☾'}
const themePreference=matchMedia('(prefers-color-scheme: dark)');
let manualTheme=['light','dark'].includes(savedTheme);
function refreshTheme(){themeLabel();timing();if(result)renderForm()}
themePreference.addEventListener('change',event=>{if(manualTheme)return;document.documentElement.dataset.theme=event.matches?'dark':'light';refreshTheme()});
$('theme').onclick=()=>{manualTheme=true;document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('theme',document.documentElement.dataset.theme)}catch{}refreshTheme()};
$('copy').onclick=async()=>{
  const source=formulaSource;let copied=false;
  try{await navigator.clipboard.writeText(source);copied=true}catch{
    const field=document.createElement('textarea');field.value=source;field.setAttribute('aria-hidden','true');field.style.cssText='position:fixed;left:-9999px';document.body.append(field);field.select();
    try{copied=document.execCommand('copy')}catch{}finally{field.remove();$('copy').focus()}
  }
  if(copied){$('copy').textContent='Copied';setTimeout(()=>$('copy').textContent='Copy ASCIIMath',1500)}else $('status').textContent='Copy failed. Check your browser clipboard permissions.';
};
$('download').onclick=()=>{const blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`karnaugh-${n}-${form}.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('download-timing').onclick=()=>{const url=URL.createObjectURL(new Blob([timingSvg(n,values,palette())],{type:'image/svg+xml'})),link=document.createElement('a');link.href=url;link.download=`karnaugh-${n}-timing.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
setupZoom();themeLabel();update();window.addEventListener('load',()=>{if(result)typeset()});
