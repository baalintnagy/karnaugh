import test from 'node:test';
import assert from 'node:assert/strict';
import {circuitGraph,layoutCircuit,renderCircuit,wireCrossings,untangleGateApproaches,spreadVerticalLanes} from '../circuit.js';
import ELK from 'elkjs/lib/elk.bundled.js';
import {solve,evaluate} from '../logic.js';
const near=(a,b)=>Math.abs(a-b)<.001;
test('terminating input rails fan into the final term without staircase crossings',async()=>{
 const tree={type:'AND',children:['A','B','C','D'].map(name=>({type:'INPUT',name}))};
 const graph=await layoutCircuit(tree,4),bus=graph.children.find(n=>n.type==='BUS');
 const ends=bus.ports.slice().sort((a,b)=>a.y-b.y).map(p=>p.name);
 assert.deepEqual(ends,['D','C','B','A']);
 const svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
 assert.ok(!svg.includes('data-wire-crossing="true"'));
 for(let row=0;row<16;row++)assert.equal(evalGraph(graph,4,row),evaluate(tree,4,row));
});
test('each input rail ends at its lowest tap; unused rails remain short and labeled',async()=>{
 const input=name=>({type:'INPUT',name});
 const graph=await layoutCircuit({type:'OR',children:[input('A'),{type:'AND',children:[input('B'),input('C')]}]},4);
 const bus=graph.children.find(n=>n.type==='BUS'),svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
 for(const name of ['A','B','C','D']){
  const taps=bus.ports.filter(p=>p.name===name),bottom=taps.length?Math.max(...taps.map(p=>bus.y+p.y)):bus.y+56;
  const path=svg.match(new RegExp(`data-edge="rail-${name}"[^>]* d="([^"]+)"`));
  assert.ok(path);assert.ok(path[1].endsWith(','+bottom));
  const x=bus.x+24+bus.inputNames.indexOf(name)*26;
  assert.ok(!svg.includes(`data-junction="true" cx="${x}" cy="${bottom}"`));
 }
 assert.ok(svg.includes('data-input-rail="D"'));
});
test('input inverters are ordered alphabetically top to bottom',async()=>{
 for(const type of ['NOT','NAND','NOR']){
  const children=['D','B','C','A'].map(name=>{const input={type:'INPUT',name};return {type,children:type==='NOT'?[input]:[input,input]}});
  const graph=await layoutCircuit({type:'AND',children},4);
  const inverters=graph.children.filter(n=>n.type===type).sort((a,b)=>a.y-b.y);
  const order=inverters.map(node=>graph.edges.find(e=>e.targets[0]===node.id+'-in-0').net);
  assert.deepEqual(order,['A','B','C','D']);
 }
});
test('literal inverters, term gates and the combiner occupy distinct columns',async()=>{
 const input=name=>({type:'INPUT',name});
 for(const universal of [false,true]){
  const A=input('A'),B=input('B'),C=input('C'),inverse=universal?{type:'NAND',children:[A,A]}:{type:'NOT',children:[A]};
  const termType=universal?'NAND':'AND',tree={type:universal?'NAND':'OR',children:[{type:termType,children:[A,B]},{type:termType,children:[inverse,C]}]};
  const graph=await layoutCircuit(tree,3),inverter=graph.children.find(n=>n.type==='NOT'||n.tiedInputs);
  const terms=graph.children.filter(n=>n.type===termType&&!n.tiedInputs&&graph.edges.some(e=>e.sources[0]===n.id+'-out'&&e.targets[0]!=='output-in'));
  assert.equal(terms.length,2);assert.equal(terms[0].x,terms[1].x);
  assert.ok(inverter.x<terms[0].x);
  const combiner=graph.children.find(n=>graph.edges.some(e=>e.sources[0]===n.id+'-out'&&e.targets[0]==='output-in'));
  assert.ok(terms[0].x<combiner.x);
  for(let row=0;row<8;row++)assert.equal(evalGraph(graph,3,row),evaluate(tree,3,row));
 }
});
test('stacked gate outputs feed a common gate without staircase crossings',async()=>{
 const tree={type:'NAND',children:['A','B','C','D','E','F'].map(name=>{const input={type:'INPUT',name};return {type:'NAND',children:[input,input]}})};
 const graph=await layoutCircuit(tree,6),root=graph.children.find(n=>n.type==='NAND'&&!n.tiedInputs);
 const feeds=graph.edges.filter(e=>e.targets[0].startsWith(root.id+'-in-'));
 assert.equal(feeds.length,6);
 assert.equal(wireCrossings({children:graph.children,edges:feeds}),0);
 const laneXs=feeds.slice().sort((a,b)=>a.sections[0].startPoint.y-b.sections[0].startPoint.y).map(e=>e.sections[0].bendPoints[0].x);
 for(let i=1;i<laneXs.length;i++)assert.ok(laneXs[i-1]-laneXs[i]>=28);
 for(let row=0;row<64;row++)assert.equal(evalGraph(graph,6,row),evaluate(tree,6,row));
});
test('foreign wires detour around junctions rather than bridging over their dots',()=>{
 const edge=(id,net,points)=>({id,net,sources:[net],targets:[],sections:[{startPoint:points[0],bendPoints:points.slice(1,-1),endPoint:points.at(-1)}]});
 const graph={width:120,height:110,children:[],edges:[edge('rail','A',[{x:50,y:0},{x:50,y:100}]),edge('branch','A',[{x:50,y:40},{x:110,y:40}]),edge('cross','B',[{x:0,y:40},{x:100,y:40}])]};
 const svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
 assert.ok(svg.includes('data-junction="true" cx="50" cy="40"'));
 assert.ok(!svg.includes('cx="50" cy="40" r="4"'));
 assert.ok(svg.includes('cx="50" cy="22" r="4"'));
 assert.ok(svg.indexOf('data-wire-crossing="true"')<svg.indexOf('data-junction="true"'));
});
test('parallel vertical wire bends get clearance while endpoints stay fixed',()=>{
 const edge=(id,x,y)=>({id,sources:[id],targets:[id+'-target'],sections:[{startPoint:{x:0,y},bendPoints:[{x,y},{x,y:y+70}],endPoint:{x:120,y:y+70}}]});
 const graph={children:[],edges:[edge('a',50,10),edge('b',53,20)]};
 const endpoints=graph.edges.map(e=>structuredClone([e.sections[0].startPoint,e.sections[0].endPoint]));
 const crossings=wireCrossings(graph);
 spreadVerticalLanes(graph);
 assert.ok(Math.abs(graph.edges[0].sections[0].bendPoints[0].x-graph.edges[1].sections[0].bendPoints[0].x)>=16);
 assert.ok(wireCrossings(graph)<=crossings);
 graph.edges.forEach((e,i)=>assert.deepEqual([e.sections[0].startPoint,e.sections[0].endPoint],endpoints[i]));
});
test('local gate approach cleanup removes an input swap without changing connections',()=>{
 const node={id:'g',type:'AND',x:100,y:0,width:94,height:124,bodyHeight:100,ports:[{id:'g-in-0',x:0,y:33},{id:'g-in-1',x:0,y:67}]};
 const edge=(id,source,target,y,endY,x)=>({id,sources:[source],targets:[target],sections:[{startPoint:{x:0,y},bendPoints:[{x,y},{x,y:endY}],endPoint:{x:100,y:endY}}]});
 const graph={children:[node],edges:[edge('a','A','g-in-1',20,67,80),edge('b','B','g-in-0',80,33,90)]};
 assert.ok(wireCrossings(graph,true)>0);
 untangleGateApproaches(graph);
 assert.equal(wireCrossings(graph,true),0);
 assert.equal(graph.edges[0].targets[0],'g-in-1');
 for(const e of graph.edges)assert.ok(near(e.sections[0].endPoint.y,node.ports.find(p=>p.id===e.targets[0]).y));
});
test('wire jumps include contacts at another net bend',()=>{
 const edge=(id,points)=>({id,sources:[id],targets:[],sections:[{startPoint:points[0],bendPoints:points.slice(1,-1),endPoint:points.at(-1)}]});
 const graph={width:100,height:100,children:[],edges:[edge('a',[{x:0,y:30},{x:100,y:30}]),edge('b',[{x:50,y:30},{x:50,y:80},{x:80,y:80}])]};
 const svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
 assert.ok(svg.includes('Q50,22'));
 assert.ok(svg.includes('data-wire-crossing="true"'));
 assert.ok(!svg.includes('data-junction="true"'));
});
test('close crossings and crossings at horizontal bends each retain a visible bridge',()=>{
 const edge=(id,points)=>({id,sources:[id],targets:[],sections:[{startPoint:points[0],bendPoints:points.slice(1,-1),endPoint:points.at(-1)}]});
 const graph={width:100,height:100,children:[],edges:[edge('h',[{x:0,y:40},{x:50,y:40},{x:50,y:70}]),edge('v1',[{x:30,y:0},{x:30,y:90}]),edge('v2',[{x:36,y:0},{x:36,y:90}]),edge('v3',[{x:50,y:0},{x:50,y:90}])]};
 const svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
 assert.ok((svg.match(/data-wire-crossing="true"/g)||[]).length>=3);
 assert.ok(svg.includes('stroke-width="5"'));
});
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
test('channel routing keeps crossings away from gates in a dense canonical circuit',async()=>{
 let state=2;
 const values=Array.from({length:32},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return +(state/2**32>.5)});
 const tree=solve(5,values).forms.dnf;
 const baseline=await new ELK().layout(circuitGraph(tree,5));
 const optimized=await layoutCircuit(tree,5);
 assert.ok(wireCrossings(optimized,true)<=wireCrossings(baseline,true));
 for(let row=0;row<32;row++)assert.equal(evalGraph(optimized,5,row),values[row]);
});
test('routed circuits enforce clearance and keep crossing bridges away from junctions',async()=>{
 const values=Array.from({length:32},(_,i)=>+((i*13%17)>7)),forms=solve(5,values).forms;
 for(const form of ['dnf','cnf','nand','nor']){
  const graph=await layoutCircuit(forms[form],5),vertical=[];
  for(const edge of graph.edges){const s=edge.sections[0],points=[s.startPoint,...(s.bendPoints||[]),s.endPoint];for(let i=1;i<points.length;i++)if(points[i].x===points[i-1].x&&points[i].y!==points[i-1].y)vertical.push({x:points[i].x,low:Math.min(points[i].y,points[i-1].y),high:Math.max(points[i].y,points[i-1].y),net:edge.net||edge.sources[0]})}
  const bus=graph.children.find(n=>n.type==='BUS');
  bus.inputNames.forEach((name,i)=>vertical.push({x:bus.x+24+i*26,low:bus.y+40,high:bus.y+bus.height-16,net:name}));
  for(let i=0;i<vertical.length;i++)for(let j=i+1;j<vertical.length;j++){const a=vertical[i],b=vertical[j];if(a.net!==b.net&&Math.min(a.high,b.high)>Math.max(a.low,b.low))assert.ok(Math.abs(a.x-b.x)>=24,`${form}: close vertical lanes`)}
  const svg=renderCircuit(graph,{text:'#fff',muted:'#999',line:'#555',accent:'#afa',bg:'#111'});
  const dots=[...svg.matchAll(/data-junction="true" cx="([\d.]+)" cy="([\d.]+)"/g)].map(m=>[+m[1],+m[2]]);
  const bridges=[...svg.matchAll(/<g data-wire-crossing="true"><circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m=>[+m[1],+m[2]]);
  for(const [x,y] of bridges)assert.ok(dots.every(([dx,dy])=>Math.abs(dx-x)>=10||Math.abs(dy-y)>=10),`${form}: bridge overlaps junction`);
 }
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
 assert.ok(!svg.includes('data-junction="true"'),'a single terminal rail tap is a bend, not a junction');
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
