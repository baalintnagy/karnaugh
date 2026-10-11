import {names,orderNumber,expression,sop} from './logic.js';
import {mapSvg,circuitSvg,colors} from './svg.js';
const $=id=>document.getElementById(id);
let n=3,values=[0,1,1,1,0,0,1,1],result=null,form='minimal',worker=null,revision=0,svg='';
const descriptions={minimal:['Minimum sum of products','Exact cover: fewest product terms, then fewest literals. Loops on the map correspond to these terms.'],dnf:['Canonical disjunctive normal form','One product term for every row whose output is 1. AND is multiplication; OR is addition.'],cnf:['Canonical conjunctive normal form','One sum clause for every row whose output is 0. AND is multiplication; OR is addition.'],nand:['NAND-only implementation','The minimized sum of products transformed with De Morgan’s law. A repeated input implements inversion.'],nor:['NOR-only implementation','The minimized product of sums transformed with De Morgan’s law. A repeated input implements inversion.'],xor:['Algebraic normal form','A unique XOR sum of AND products over GF(2). ⊕ is XOR; this form has no complemented inputs.']};
function table(){
  $('truth-table').querySelector('thead').innerHTML=`<tr><th scope="col">i</th>${names(n).map(v=>`<th scope="col">${v}</th>`).join('')}<th scope="col">f</th></tr>`;
  $('truth-table').querySelector('tbody').innerHTML=values.map((v,i)=>`<tr><td>${i}</td>${names(n).map((_,j)=>`<td>${(i>>(n-1-j))&1}</td>`).join('')}<td><button class="bit ${v?'on':''}" data-index="${i}" aria-label="Row ${i}, output ${v}. Toggle output." aria-pressed="${!!v}">${v}</button></td></tr>`).join('');
  $('row-count').textContent=`${values.length} rows`;$('variables').value=n;$('minus').disabled=n===1;$('plus').disabled=n===8;
}
function map(){ $('map').innerHTML=mapSvg(n,values,result?.ones||[]);$('legend').replaceChildren();if(result){result.ones.forEach((c,i)=>{const item=document.createElement('span');item.className='legend-item';const dot=document.createElement('i');dot.style.background=colors[i%colors.length];item.append(dot,document.createTextNode(expression(sop(n,[c]))));$('legend').append(item)})} }
function palette(){const style=getComputedStyle(document.documentElement);return Object.fromEntries(['text','muted','line','accent','bg'].map(k=>[k,style.getPropertyValue('--'+(k==='bg'?'panel':k)).trim()]))}
async function typeset(){try{if(window.MathJax?.startup?.promise){await window.MathJax.startup.promise;await window.MathJax.typesetPromise?.([$('formula')])}}catch{/* Source remains readable if the CDN is unavailable. */}}
function renderForm(){
  $('expression-content').setAttribute('aria-labelledby','tab-'+form);
  document.querySelectorAll('[data-form]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.form===form));b.tabIndex=b.dataset.form===form?0:-1});
  $('form-name').textContent=descriptions[form][0];$('form-note').textContent=descriptions[form][1];
  $('copy').disabled=!result;$('download').disabled=!result;
  try{window.MathJax?.typesetClear?.([$('formula')])}catch{}
  if(!result){$('formula').textContent='Computing exact cover…';$('source').textContent='';$('diagram').replaceChildren();return}
  const source='f = '+expression(result.forms[form]);$('source').textContent=source;$('formula').textContent='`'+source+'`';
  svg=circuitSvg(result.forms[form],palette());$('diagram').innerHTML=svg;typeset();
}
function update(){
  const id=++revision;worker?.terminate();result=null;table();map();renderForm();
  $('order').textContent=orderNumber(values);$('ones').textContent=values.filter(Boolean).length;$('groups').textContent='…';$('status').textContent='Finding exact minimum…';
  try{worker=new Worker(new URL('./solver-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(id!==revision)return;if(data.error){fail(data.error);return}result=data.result;$('groups').textContent=result.ones.length;$('status').textContent='Exact solution';map();renderForm();worker.terminate()};worker.onerror=()=>fail('Solver could not start. Serve this folder over HTTP.');worker.postMessage({n,values})}catch(error){fail(error.message)}
}
function fail(message){$('status').textContent=message;$('formula').textContent='Unable to solve. Reload the page or use a local HTTP server.';$('groups').textContent='–'}
function setN(value){const next=Math.max(1,Math.min(8,Math.round(Number(value)||1)));if(next===n){$('variables').value=n;return}n=next;values=Array.from({length:2**n},(_,i)=>values[i]||0);$('preset').value='';update()}
function toggle(i){const focused=document.activeElement?.dataset?.index===String(i),inTable=$('truth-table').contains(document.activeElement);values[i]^=1;$('preset').value='';update();if(focused)(inTable?$('truth-table'):$('map')).querySelector(`[data-index="${i}"]`)?.focus()}
$('variables').addEventListener('input',e=>{if(e.target.value!==''&&Number.isInteger(+e.target.value)&&+e.target.value>=1&&+e.target.value<=8)setN(e.target.value)});
$('variables').addEventListener('change',e=>setN(e.target.value));$('minus').onclick=()=>setN(n-1);$('plus').onclick=()=>setN(n+1);
$('truth-table').onclick=e=>{const b=e.target.closest('[data-index]');if(b)toggle(+b.dataset.index)};
$('map').onclick=e=>{const cell=e.target.closest('[data-index]');if(cell)toggle(+cell.dataset.index)};
$('map').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const cell=e.target.closest('[data-index]');if(cell){e.preventDefault();const i=+cell.dataset.index;toggle(i);$('map').querySelector(`[data-index="${i}"]`)?.focus()}}};
$('clear').onclick=()=>{values.fill(0);$('preset').value='';update()};$('invert').onclick=()=>{values=values.map(v=>1-v);$('preset').value='';update()};$('random').onclick=()=>{values=values.map(()=>Math.random()<.5?0:1);$('preset').value='';update()};
$('preset').onchange=e=>{const p=e.target.value;if(!p)return;values=values.map((_,i)=>{const bits=i.toString(2).split('1').length-1;return p==='majority'?+(bits>n/2):p==='parity'?bits%2:(i>>(n-1))&1});update()};
document.querySelector('.tabs').onclick=e=>{const button=e.target.closest('[data-form]');if(button){form=button.dataset.form;renderForm()}};
document.querySelector('.tabs').onkeydown=e=>{const buttons=[...document.querySelectorAll('[data-form]')];const i=buttons.indexOf(document.activeElement);if(i<0)return;let next;if(e.key==='ArrowRight')next=(i+1)%buttons.length;if(e.key==='ArrowLeft')next=(i+buttons.length-1)%buttons.length;if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;if(next!==undefined){e.preventDefault();form=buttons[next].dataset.form;renderForm();buttons[next].focus()}};
function themeLabel(){$('theme').setAttribute('aria-label',`Switch to ${document.documentElement.dataset.theme==='dark'?'light':'dark'} theme`);$('theme').textContent=document.documentElement.dataset.theme==='dark'?'☼':'☾'}
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('theme',document.documentElement.dataset.theme)}catch{}themeLabel();if(result)renderForm()};
$('copy').onclick=async()=>{const source=$('source').textContent;try{await navigator.clipboard.writeText(source);$('copy').textContent='Copied';setTimeout(()=>$('copy').textContent='Copy ASCIIMath',1500)}catch{$('source').parentElement.open=true;const selection=window.getSelection(),range=document.createRange();range.selectNodeContents($('source'));selection.removeAllRanges();selection.addRange(range);$('status').textContent='ASCIIMath selected. Press Ctrl+C / ⌘C to copy.'}};
$('download').onclick=()=>{const blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`karnaugh-${n}-${form}.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
themeLabel();update();window.addEventListener('load',()=>{if(result)typeset()});
