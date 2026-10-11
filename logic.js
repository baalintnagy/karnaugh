export const names = n => Array.from({length:n},(_,i)=>String.fromCharCode(65+i));
export const popcount = x => {let n=0;while(x){x&=x-1;n++}return n};
export const matches = (cube,i) => (i & ~cube.mask) === cube.bits;
export const orderNumber = values => values.reduce((sum,v,i)=>v?sum+(1n<<BigInt(i)):sum,0n).toString();
export const gray = bits => Array.from({length:2**bits},(_,i)=>i^(i>>1));

// Quine–McCluskey prime generation followed by an exact prime-chart cover.
// The objective is lexicographic: term count, then literal count.
export function minimize(n, values, target=1){
  const indices=values.flatMap((v,i)=>v===target?[i]:[]);
  if(!indices.length)return [];
  let current=indices.map(bits=>({bits,mask:0}));
  const primes=[];
  while(current.length){
    const used=new Set(), next=new Map(), lookup=new Map(current.map((c,i)=>[`${c.mask}:${c.bits}`,i]));
    current.forEach((c,i)=>{
      for(let bit=1;bit<2**n;bit<<=1){
        if(c.mask&bit)continue;
        const j=lookup.get(`${c.mask}:${c.bits^bit}`);
        if(j!==undefined){used.add(i);used.add(j);const merged={bits:c.bits&~bit,mask:c.mask|bit};next.set(`${merged.mask}:${merged.bits}`,merged)}
      }
    });
    current.forEach((c,i)=>{if(!used.has(i))primes.push(c)});
    current=[...next.values()];
  }
  const covers=primes.map(c=>indices.reduce((b,i,j)=>matches(c,i)?b|(1n<<BigInt(j)):b,0n));
  let chart=indices.map((_,j)=>covers.flatMap((b,i)=>b&(1n<<BigInt(j))?[i]:[]));
  const literals=primes.map(c=>n-popcount(c.mask));
  const full=(1n<<BigInt(indices.length))-1n;
  let covered=0n;const essential=new Set();
  for(const choices of chart)if(choices.length===1)essential.add(choices[0]);
  for(const i of essential)covered|=covers[i];
  let active=covers.map((_,i)=>i),changed=true;
  while(changed&&covered!==full){
    changed=false;
    const remaining=full&~covered;
    active=active.filter(i=>!!(covers[i]&remaining));
    const dominated=new Set();
    for(const i of active)for(const j of active)if(i!==j&&literals[j]<=literals[i]){
      const a=covers[i]&remaining,b=covers[j]&remaining;
      if((a&b)===a&&(a!==b||literals[j]<literals[i]||j<i)){dominated.add(i);break}
    }
    if(dominated.size){active=active.filter(i=>!dominated.has(i));changed=true}
    chart=indices.map((_,j)=>active.filter(i=>!!(covers[i]&(1n<<BigInt(j)))));
    for(let j=0;j<indices.length;j++)if((remaining&(1n<<BigInt(j)))&&chart[j].length===1){const i=chart[j][0];essential.add(i);covered|=covers[i];changed=true}
  }
  if(covered===full)return [...essential].map(i=>primes[i]);
  const optionBits=chart.map(options=>options.reduce((bits,i)=>bits|(1n<<BigInt(i)),0n));
  const constrained=chart.map((_,i)=>i).sort((a,b)=>chart[a].length-chart[b].length);
  const countBits=b=>{let s=0;while(b){b&=b-1n;s++}return s};
  let greedyCovered=covered;const greedy=[...essential];
  while(greedyCovered!==full){let pick=-1,score=-1;covers.forEach((c,i)=>{const gain=countBits(c&~greedyCovered);if(gain>score||(gain===score&&literals[i]<literals[pick])){score=gain;pick=i}});greedy.push(pick);greedyCovered|=covers[pick]}
  let best=greedy,bestLiterals=best.reduce((s,i)=>s+literals[i],0);
  const memo=new Map();
  function visit(cov,selected,cost){
    if(cov===full){if(selected.length<best.length||(selected.length===best.length&&cost<bestLiterals)){best=[...selected];bestLiterals=cost}return}
    if(selected.length>=best.length)return;
    const key=cov.toString(),previous=memo.get(key);
    if(previous&&(previous[0]<selected.length||(previous[0]===selected.length&&previous[1]<=cost)))return;
    memo.set(key,[selected.length,cost]);
    const uncovered=full&~cov;
    let maxGain=0;for(const c of covers)maxGain=Math.max(maxGain,countBits(c&uncovered));
    let lowerBound=Math.ceil(countBits(uncovered)/maxGain),packing=0,usedOptions=0n,minCost=0;
    // Rows whose candidate sets are disjoint must be covered by distinct terms.
    for(const j of constrained)if((uncovered&(1n<<BigInt(j)))&&!(optionBits[j]&usedOptions)){packing++;usedOptions|=optionBits[j];minCost+=Math.min(...chart[j].map(i=>literals[i]))}
    lowerBound=Math.max(lowerBound,packing);
    if(selected.length+lowerBound>best.length)return;
    if(selected.length+packing===best.length&&cost+minCost>=bestLiterals)return;
    let choices=null;
    for(let j=0;j<indices.length;j++)if(uncovered&(1n<<BigInt(j))){if(!choices||chart[j].length<choices.length)choices=chart[j]}
    choices=[...choices].sort((a,b)=>countBits(covers[b]&uncovered)-countBits(covers[a]&uncovered)||literals[a]-literals[b]);
    for(const i of choices)visit(cov|covers[i],[...selected,i],cost+literals[i]);
  }
  visit(covered,[...essential],[...essential].reduce((s,i)=>s+literals[i],0));
  return best.map(i=>primes[i]).sort((a,b)=>a.bits-b.bits||a.mask-b.mask);
}
const constant=value=>({type:'CONST',value});
const variable=name=>({type:'INPUT',name});
const gate=(type,children)=>({type,children});
const combine=(type,children,empty)=>children.length===0?constant(empty):children.length===1?children[0]:gate(type,children);
function cubeLiterals(n,c,invert=false){return names(n).flatMap((name,j)=>{const bit=1<<(n-j-1);if(c.mask&bit)return [];const positive=!!(c.bits&bit)!==invert;return [positive?variable(name):gate('NOT',[variable(name)])]})}
export function sop(n,cubes){return combine('OR',cubes.map(c=>combine('AND',cubeLiterals(n,c),1)),0)}
export function pos(n,cubes){return combine('AND',cubes.map(c=>combine('OR',cubeLiterals(n,c,true),0)),1)}
export function anf(n,values){
  const coefficients=[...values];
  for(let bit=1;bit<values.length;bit<<=1)for(let i=0;i<values.length;i++)if(i&bit)coefficients[i]^=coefficients[i^bit];
  return combine('XOR',coefficients.flatMap((v,i)=>v?[combine('AND',names(n).flatMap((name,j)=>i&(1<<(n-j-1))?[variable(name)]:[]),1)]:[]),0);
}
export function universal(tree,type){
  if(tree.type==='INPUT'||tree.type==='CONST')return tree;
  const inv=x=>x.type===type&&x.children.length===2&&x.children[0]===x.children[1]?x.children[0]:gate(type,[x,x]);
  const children=tree.children.map(c=>universal(c,type));
  if(tree.type==='NOT')return inv(children[0]);
  if(type==='NAND')return tree.type==='AND'?inv(gate(type,children)):gate(type,children.map(inv));
  return tree.type==='OR'?inv(gate(type,children)):gate(type,children.map(inv));
}
export function expression(tree){
  if(tree.type==='INPUT')return tree.name;
  if(tree.type==='CONST')return String(tree.value);
  if(tree.type==='NOT')return `bar(${expression(tree.children[0])})`;
  const kids=tree.children.map(expression);
  const op={AND:' ',OR:' + ',XOR:' oplus ',NAND:' ',NOR:' + '}[tree.type];
  const body=kids.map((s,i)=>['INPUT','CONST','NOT'].includes(tree.children[i].type)?s:`(${s})`).join(op);
  return ['NAND','NOR'].includes(tree.type)?`bar(${body})`:body;
}
export function evaluate(tree,n,i){
  if(tree.type==='CONST')return tree.value;
  if(tree.type==='INPUT')return (i>>(n-1-(tree.name.charCodeAt(0)-65)))&1;
  const v=tree.children.map(c=>evaluate(c,n,i));
  switch(tree.type){case 'NOT':return 1-v[0];case 'AND':return +v.every(Boolean);case 'OR':return +v.some(Boolean);case 'XOR':return v.reduce((a,b)=>a^b,0);case 'NAND':return +!v.every(Boolean);case 'NOR':return +!v.some(Boolean)}
}
export function solve(n,values){
  const ones=minimize(n,values),zeros=minimize(n,values,0),minimal=sop(n,ones),minimalPos=pos(n,zeros);
  return {ones,zeros,forms:{minimal,dnf:sop(n,values.flatMap((v,bits)=>v?[{bits,mask:0}]:[])),cnf:pos(n,values.flatMap((v,bits)=>v?[]:[{bits,mask:0}])),nand:universal(minimal,'NAND'),nor:universal(minimalPos,'NOR'),xor:anf(n,values)}};
}
