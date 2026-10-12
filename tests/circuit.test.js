import test from 'node:test';
import assert from 'node:assert/strict';
import {circuitGraph,layoutCircuit,renderCircuit,wireCrossings} from '../circuit.js';
import ELK from 'elkjs/lib/elk.bundled.js';
import {solve,evaluate} from '../logic.js';
const near=(a,b)=>Math.abs(a-b)<.001;
test('NAND and NOR inverters share one routed feed and split next to the gate',async()=>{
 for(const type of ['NAND','NOR']){
  const input={type:'INPUT',name:'A'},tree={type,children:[input,input]};
  const graph=await layoutCircuit(tree,1),bus=graph.children.find(node=>node.type==='BUS');
  assert.equal(bus.ports.length,1);
  const feeds=graph.edges.filter(edge=>edge.targets[0].includes('-in-'));
  assert.equal(feeds.length,2);
  assert.equal(feeds.filter(edge=>edge.sharedFeed).length,1);
  assert.equal(feeds[0].sources[0],feeds[1].sources[0]);
  assert.deepEqual(feeds[0].sections,feeds[1].sections);
  const svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
  assert.equal((svg.match(/data-local-split="true"/g)||[]).length,1);
  for(let row=0;row<2;row++)assert.equal(evalGraph(graph,1,row),1-row);
 }
});
test('gate pin ordering reduces crossings in a dense canonical circuit',async()=>{
 let state=2;
 const values=Array.from({length:32},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return +(state/2**32>.5)});
 const tree=solve(5,values).forms.dnf;
 const baseline=await new ELK().layout(circuitGraph(tree,5));
 const optimized=await layoutCircuit(tree,5);
 assert.ok(wireCrossings(optimized)<wireCrossings(baseline));
 for(let row=0;row<32;row++)assert.equal(evalGraph(optimized,5,row),values[row]);
});
function evalGraph(graph,n,row){
 const results=new Map();
 for(const node of graph.children){
  if(node.type==='BUS'){for(const p of node.ports)results.set(p.id,(row>>(n-1-(p.name.charCodeAt(0)-65)))&1);continue}
  const inputs=node.ports.filter(p=>p.id.endsWith('-in')||p.id.includes('-in-')).map(p=>{const edge=graph.edges.find(e=>e.targets[0]===p.id);assert.ok(edge,`missing input ${p.id}`);return results.get(edge.sources[0])});
  let value;
  switch(node.type){case 'INPUT':value=(row>>(n-1-(node.name.charCodeAt(0)-65)))&1;break;case 'CONST':value=node.value;break;case 'OUTPUT':value=inputs[0];break;case 'NOT':value=1-inputs[0];break;case 'AND':value=+inputs.every(Boolean);break;case 'OR':value=+inputs.some(Boolean);break;case 'NAND':value=+!inputs.every(Boolean);break;case 'NOR':value=+!inputs.some(Boolean);break;case 'XOR':value=inputs.reduce((a,b)=>a^b,0);break}
  assert.ok(value===0||value===1);results.set(node.id+'-out',value);
 }
 return results.get('output-out');
}
test('rendered netlist implements every truth table through three variables, including tied NAND/NOR pins',()=>{
 for(let n=1;n<=3;n++)for(let order=0;order<2**(2**n);order++){
  const values=Array.from({length:2**n},(_,i)=>(order>>i)&1),forms=solve(n,values).forms;
  for(const form of ['minimal','dnf','cnf','nand','nor']){const graph=circuitGraph(forms[form]);for(let i=0;i<values.length;i++)assert.equal(evalGraph(graph,n,i),values[i],`${form} row ${i}`)}
 }
});
test('input bus keeps A–H in order, retains unused inputs, and preserves tied gate inputs',async()=>{
 const values=Array.from({length:256},(_,i)=>(i>>7)&1),tree=solve(8,values).forms.minimal;
 const graph=await layoutCircuit(tree,8),bus=graph.children.find(node=>node.type==='BUS');
 assert.deepEqual(bus.inputNames,['A','B','C','D','E','F','G','H']);
 assert.deepEqual(bus.ports.map(p=>p.name),['A']);
 for(let i=0;i<256;i++)assert.equal(evalGraph(graph,8,i),values[i]);
 const svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
 assert.deepEqual([...svg.matchAll(/data-input-rail="([A-H])"/g)].map(m=>m[1]),bus.inputNames);
 assert.ok(svg.includes('data-junction="true"'));
 const nand=circuitGraph(solve(2,[0,0,0,1]).forms.nand,2);
 for(let i=0;i<4;i++)assert.equal(evalGraph(nand,2,i),+(i===3));
 const constant=await layoutCircuit(solve(2,[1,1,1,1]).forms.minimal,2);
 assert.deepEqual(constant.children.find(node=>node.type==='BUS').inputNames,['A','B']);
 for(let i=0;i<4;i++)assert.equal(evalGraph(constant,2,i),1);
});
test('ELK routes each wire between its exact pins without passing through gate bodies',async()=>{
 const tables=[[0,1,1,1,0,0,1,1],[0,1,1,0,1,0,0,1],Array.from({length:256},(_,i)=>(i>>7)&1)];
 for(const values of tables){const n=Math.log2(values.length),forms=solve(n,values).forms;
  for(const form of ['minimal','dnf','cnf','nand','nor']){
   const graph=await layoutCircuit(forms[form]),ports=new Map(graph.children.flatMap(node=>node.ports.map(p=>[p.id,{x:node.x+p.x,y:node.y+p.y}])));
   for(const edge of graph.edges){assert.equal(edge.sections.length,1);const section=edge.sections[0];for(const [point,id] of [[section.startPoint,edge.sources[0]],[section.endPoint,edge.targets[0]]]){assert.ok(near(point.x,ports.get(id).x));assert.ok(near(point.y,ports.get(id).y))}
    const points=[section.startPoint,...(section.bendPoints||[]),section.endPoint];
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];assert.ok(near(a.x,b.x)||near(a.y,b.y),'orthogonal route');for(const node of graph.children){const x0=node.x+.01,x1=node.x+node.width-.01,y0=node.y+.01,y1=node.y+node.height-.01;const crosses=near(a.y,b.y)?a.y>y0&&a.y<y1&&Math.max(a.x,b.x)>x0&&Math.min(a.x,b.x)<x1:a.x>x0&&a.x<x1&&Math.max(a.y,b.y)>y0&&Math.min(a.y,b.y)<y1;assert.ok(!crosses,`${edge.id} passes through ${node.id}`)}}
   }
   for(let i=0;i<values.length;i++)assert.equal(evalGraph(graph,n,i),evaluate(forms[form],n,i));
  }
 }
});
test('rail taps align with first-layer gate inputs instead of keeping vertical branch detours',async()=>{
 const graph=await layoutCircuit(solve(3,[0,1,1,1,0,0,1,1]).forms.nand,3);
 const bus=graph.children.find(node=>node.type==='BUS'),firstX=Math.min(...graph.children.filter(node=>node!==bus).map(node=>node.x));
 const targets=new Set(graph.children.filter(node=>near(node.x,firstX)).flatMap(node=>node.ports.map(p=>p.id)));
 const direct=graph.edges.filter(edge=>edge.sources[0].startsWith('bus-')&&targets.has(edge.targets[0]));
 assert.ok(direct.length>0);
 for(const edge of direct){const section=edge.sections[0];assert.ok(near(section.startPoint.y,section.endPoint.y));for(const p of section.bendPoints||[])assert.ok(near(p.y,section.endPoint.y))}
 for(const port of bus.ports){assert.ok(port.y>=40);assert.ok(port.y<=bus.height-16)}
});
