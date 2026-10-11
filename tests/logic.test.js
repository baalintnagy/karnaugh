import test from 'node:test';
import assert from 'node:assert/strict';
import {solve,evaluate,minimize,matches,orderNumber,popcount,gray,expression} from '../logic.js';
import {mapSvg,circuitSvg,timingSignals,timingSvg} from '../svg.js';
test('split map groups use open half-loops at matching opposite edges',()=>{
 const horizontal=mapSvg(4,Array(16).fill(1),[{bits:0,mask:2}]);
 assert.ok(horizontal.includes('data-continuation="west"'));
 assert.ok(horizontal.includes('data-continuation="east"'));
 assert.equal((horizontal.match(/data-map-group="1"/g)||[]).length,2);
 const corners=mapSvg(4,Array(16).fill(1),[{bits:0,mask:10}]);
 for(const sides of ['north west','north east','south west','east south'])assert.ok(corners.includes(`data-continuation="${sides}"`),sides);
 assert.equal((corners.match(/data-map-group="1"/g)||[]).length,4);
 assert.ok(!horizontal.includes('stroke-dasharray'));
 assert.ok(horizontal.includes(' A'));
});
function equivalent(n,values){const result=solve(n,values);for(const [name,tree] of Object.entries(result.forms))for(let i=0;i<values.length;i++)assert.equal(evaluate(tree,n,i),values[i],`${name}, n=${n}, row=${i}`);return result}
test('every Boolean function with up to three inputs: all six forms are equivalent',()=>{for(let n=1;n<=3;n++)for(let order=0;order<2**(2**n);order++)equivalent(n,Array.from({length:2**n},(_,i)=>(order>>i)&1))});
test('minimum cover agrees with an independent exhaustive cube-cover oracle for three inputs',()=>{
 const n=3,cubes=[];for(let mask=0;mask<8;mask++)for(let bits=0;bits<8;bits++)if(!(bits&mask))cubes.push({bits,mask});
 for(let order=0;order<256;order++){
  const values=Array.from({length:8},(_,i)=>(order>>i)&1),valid=cubes.filter(c=>values.every((v,i)=>!matches(c,i)||v));
  const dp=new Map([[0,[0,0]]]);
  for(const c of valid){let covered=0;values.forEach((_,i)=>{if(matches(c,i))covered|=1<<i});for(const [state,cost]of [...dp]){const next=state|covered,nc=[cost[0]+1,cost[1]+n-popcount(c.mask)],old=dp.get(next);if(!old||nc[0]<old[0]||(nc[0]===old[0]&&nc[1]<old[1]))dp.set(next,nc)}}
  const actual=minimize(n,values);assert.deepEqual([actual.length,actual.reduce((s,c)=>s+n-popcount(c.mask),0)],dp.get(order));
 }
});
test('structured eight-variable functions and deterministic random tables',()=>{
 for(let n=4;n<=8;n++){
  equivalent(n,Array.from({length:2**n},(_,i)=>popcount(i)%2));
  equivalent(n,Array.from({length:2**n},(_,i)=>+!!(i&(1<<(n-1)))));
  equivalent(n,Array.from({length:2**n},(_,i)=>+(popcount(i)>n/2)));
  let seed=123456+n;equivalent(n,Array.from({length:2**n},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>31}));
 }
});
test('order numbers keep all 256 bits',()=>{assert.equal(orderNumber([0,1,0,1]),'10');assert.equal(orderNumber(Array(256).fill(1)),((1n<<256n)-1n).toString());assert.equal(orderNumber([...Array(255).fill(0),1]),(1n<<255n).toString())});
test('Gray maps include every row once and adjacent labels differ by one bit',()=>{for(let n=1;n<=8;n++){const codes=gray(n);assert.equal(new Set(codes).size,2**n);for(let i=0;i<codes.length;i++)assert.equal(popcount(codes[i]^codes[(i+1)%codes.length]),1);const svg=mapSvg(n,Array(2**n).fill(1),[{bits:0,mask:2**n-1}]);assert.equal((svg.match(/class="map-cell"/g)||[]).length,2**n)}});
test('gate diagram is a standalone SVG with actual NAND symbols',async()=>{const tree=solve(2,[0,0,0,1]).forms.nand;const svg=await circuitSvg(tree,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});assert.ok(svg.startsWith('<svg xmlns='));assert.ok(svg.includes('NAND'));assert.ok(svg.includes('<circle'))});
test('juxtaposition preserves grouping in SOP, CNF and NAND formulas',()=>{
 assert.equal(expression(solve(2,[0,0,0,1]).forms.minimal),'A B');
 assert.equal(expression(solve(2,[0,1,1,0]).forms.cnf),'(A + B) (bar(A) + bar(B))');
 for(const tree of Object.values(solve(3,[0,1,1,0,1,0,0,1]).forms))assert.ok(!expression(tree).includes('*'));
});
test('timing signals enumerate every input combination and preserve the output table',()=>{
 for(let n=1;n<=8;n++){
  const values=Array.from({length:2**n},(_,i)=>popcount(i)%2),signals=timingSignals(n,values);
  assert.equal(signals.length,n+1);assert.deepEqual(signals.at(-1),{name:'f',values});
  for(let i=0;i<values.length;i++)assert.equal(parseInt(signals.slice(0,n).map(s=>s.values[i]).join(''),2),i);
  const svg=timingSvg(n,values,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
  assert.equal((svg.match(/data-signal=/g)||[]).length,n+1);assert.ok(svg.includes('no propagation delay'));
 }
});
