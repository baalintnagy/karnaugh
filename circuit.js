// ELK only lays out this netlist. Gate semantics and SVG rendering stay local.
export function circuitGraph(tree,variableCount){
  const nodes=[],intern=new Map(),edges=[];
  const port=(id,x,y,side)=>({id,x,y,width:0,height:0,layoutOptions:{'elk.port.side':side}});
  function add(t){
    const children=(t.children||[]).map(add),key=t.type+':'+(t.name??t.value??'')+':'+children.map(c=>c.id).join(',');
    if(intern.has(key))return intern.get(key);
    const tiedInputs=['NAND','NOR'].includes(t.type)&&children.length===2&&children[0].id===children[1].id;
    const id='n'+nodes.length,bodyHeight=children.length?Math.max(48,children.length*24+24):32,width=children.length?94+(tiedInputs?24:0):44;
    const node={id,type:t.type,name:t.name,value:t.value,tiedInputs,bodyHeight,width,height:bodyHeight+(children.length?24:0),
      layoutOptions:{'elk.portConstraints':'FIXED_POS'},
      ports:[...children.map((_,i)=>port(`${id}-in-${i}`,0,tiedInputs?bodyHeight/2:(i+1)*bodyHeight/(children.length+1),'WEST')),port(`${id}-out`,width,bodyHeight/2,'EAST')]};
    nodes.push(node);intern.set(key,node);
    children.forEach((c,i)=>edges.push({id:'e'+edges.length,sources:[`${c.id}-out`],targets:[`${id}-in-${i}`]}));
    return node;
  }
  const root=add(tree),output={id:'output',type:'OUTPUT',width:44,height:32,bodyHeight:32,layoutOptions:{'elk.portConstraints':'FIXED_POS'},ports:[port('output-in',0,16,'WEST')]};
  nodes.push(output);edges.push({id:'e'+edges.length,sources:[`${root.id}-out`],targets:['output-in']});
  const inputs=nodes.filter(node=>node.type==='INPUT').sort((a,b)=>a.name.localeCompare(b.name));
  const inputNames=variableCount?Array.from({length:variableCount},(_,i)=>String.fromCharCode(65+i)):inputs.map(node=>node.name);
  let bus;
  if(inputNames.length){
    const taps=[];
    for(const name of inputNames){
      const input=inputs.find(node=>node.name===name);if(!input)continue;
      const outgoing=edges.filter(edge=>edge.sources[0]===`${input.id}-out`),batchSize=Math.max(1,Math.ceil(outgoing.length/4));
      // Large tables share up to four rail taps per input, then fan out through
      // ELK's routed branches. This keeps canonical circuits compact.
      for(let i=0;i<outgoing.length;i+=batchSize){
        const tapId=`bus-${name}-tap-${taps.length}`;taps.push({id:tapId,name});
        for(const edge of outgoing.slice(i,i+batchSize)){edge.sources=[tapId];edge.net=name}
      }
    }
    const width=48+inputNames.length*26,height=Math.max(140,80+taps.length*18);
    bus={id:'input-bus',type:'BUS',inputNames,width,height,bodyHeight:height,layoutOptions:{'elk.portConstraints':'FIXED_POS','elk.layered.layering.layerConstraint':'FIRST'},ports:taps.map((tap,i)=>({...port(tap.id,width,60+i*18,'EAST'),name:tap.name}))};
  }
  return {id:'circuit',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.edgeRouting':'ORTHOGONAL','elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES','elk.padding':'[top=24,left=24,bottom=24,right=24]','elk.spacing.nodeNode':'32','elk.spacing.edgeNode':'24','elk.spacing.edgeEdge':'24','elk.layered.spacing.nodeNodeBetweenLayers':'120','elk.layered.spacing.edgeEdgeBetweenLayers':'24','elk.layered.mergeEdges':'false','elk.randomSeed':'1'},children:[...(bus?[bus]:[]),...nodes.filter(node=>node.type!=='INPUT')],edges};
}
let elk;
const layouts=new WeakMap();
export function wireCrossings(graph,nearGate=false){
  const segments=graph.edges.flatMap(edge=>(edge.sections||[]).flatMap(section=>{
    const points=[section.startPoint,...(section.bendPoints||[]),section.endPoint];
    return points.slice(1).map((b,i)=>({a:points[i],b,net:edge.net||edge.sources[0]}));
  }));
  const horizontal=segments.filter(s=>s.a.y===s.b.y),vertical=segments.filter(s=>s.a.x===s.b.x);
  let count=0;
  for(const h of horizontal)for(const v of vertical)if(h.net!==v.net&&v.a.x>Math.min(h.a.x,h.b.x)&&v.a.x<Math.max(h.a.x,h.b.x)&&h.a.y>Math.min(v.a.y,v.b.y)&&h.a.y<Math.max(v.a.y,v.b.y)){
    if(!nearGate||graph.children.some(node=>node.ports.some(p=>p.id.includes('-in-'))&&v.a.x>=node.x-48&&v.a.x<node.x&&h.a.y>=node.y&&h.a.y<=node.y+node.bodyHeight))count++;
  }
  return count;
}
export function untangleGateApproaches(graph){
  const pointsOf=edge=>{const s=edge.sections[0];return [s.startPoint,...(s.bendPoints||[]),s.endPoint]};
  for(const node of graph.children.filter(n=>!n.tiedInputs&&['AND','OR','NAND','NOR','XOR'].includes(n.type))){
    const incoming=graph.edges.filter(e=>e.targets[0].startsWith(`${node.id}-in-`));
    if(incoming.length<2)continue;
    const cut=node.x-16*(incoming.length+2),routes=[];
    for(const edge of incoming){
      const points=pointsOf(edge);let entry=-1;
      for(let i=0;i<points.length-1;i++)if(points[i].y===points[i+1].y&&points[i].x<=cut&&points[i+1].x>=cut&&points.slice(i+1).every(p=>p.x>=cut))entry=i;
      if(entry<0)break;
      routes.push({edge,points,entry,y:points[entry].y});
    }
    if(routes.length!==incoming.length)continue;
    routes.sort((a,b)=>a.y-b.y);
    const pinY=r=>node.ports.find(p=>p.id===r.edge.targets[0]).y;
    if(routes.every((r,i)=>!i||pinY(routes[i-1])<=pinY(r)))continue;
    const saved=routes.map(r=>structuredClone(r.edge.sections)),oldPorts=node.ports.map(p=>p.y),before=wireCrossings(graph);
    routes.forEach((r,i)=>{
      const pin=node.ports.find(p=>p.id===r.edge.targets[0]),targetY=node.y+(i+1)*node.bodyHeight/(routes.length+1);
      pin.y=targetY-node.y;
      const lane=targetY>=r.y?node.x-16*(i+1):cut+16*(i+1);
      const points=[...r.points.slice(0,r.entry+1),{x:lane,y:r.y},{x:lane,y:targetY},{x:node.x,y:targetY}];
      r.edge.sections[0].bendPoints=points.slice(1,-1);r.edge.sections[0].endPoint=points.at(-1);
    });
    const hitsNode=routes.some(r=>{const p=pointsOf(r.edge);return p.slice(1).some((b,i)=>graph.children.some(other=>{
      if(other===node)return false;
      const a=p[i],left=other.x+.01,right=other.x+other.width-.01,top=other.y+.01,bottom=other.y+other.height-.01;
      return a.y===b.y?a.y>top&&a.y<bottom&&Math.max(a.x,b.x)>left&&Math.min(a.x,b.x)<right:a.x>left&&a.x<right&&Math.max(a.y,b.y)>top&&Math.min(a.y,b.y)<bottom;
    }))});
    if(hitsNode||wireCrossings(graph)>=before){routes.forEach((r,i)=>r.edge.sections=saved[i]);node.ports.forEach((p,i)=>p.y=oldPorts[i])}
  }
  return graph;
}
async function layoutWithOrderedPins(graph){
  // Commutative gates may permute inputs without changing their function.
  // Let crossing minimization choose their order, then restore our exact pin
  // spacing and centered outputs before the final orthogonal routing pass.
  const flexible=structuredClone(graph);
  const gates=flexible.children.filter(node=>!node.tiedInputs&&['AND','OR','NAND','NOR','XOR'].includes(node.type));
  if(!gates.some(node=>node.ports.length>2))return elk.layout(graph);
  const baseline=await elk.layout(structuredClone(graph));
  for(const node of gates){
    node.layoutOptions['elk.portConstraints']='FIXED_SIDE';
    for(const p of node.ports){delete p.x;delete p.y}
  }
  const ordering=await elk.layout(flexible);
  for(const node of graph.children){
    if(!gates.some(gate=>gate.id===node.id))continue;
    const placed=ordering.children.find(gate=>gate.id===node.id);
    const inputs=placed.ports.filter(p=>p.id.includes('-in-')).sort((a,b)=>a.y-b.y);
    inputs.forEach((p,i)=>{node.ports.find(pin=>pin.id===p.id).y=(i+1)*node.bodyHeight/(inputs.length+1)});
  }
  const approachGraph=structuredClone(graph);
  const candidate=await elk.layout(graph);
  // The last routing bend, rather than the source gate's position, determines
  // which input order avoids crossings immediately beside the target gate.
  for(const node of approachGraph.children){
    if(!gates.some(gate=>gate.id===node.id))continue;
    const incoming=candidate.edges.filter(edge=>edge.targets[0].startsWith(`${node.id}-in-`));
    const arrival=edge=>{
      const section=edge.sections[0],points=[section.startPoint,...(section.bendPoints||[]),section.endPoint];
      for(let i=points.length-2;i>0;i--)if(points[i].x===points[i-1].x&&points[i].y!==points[i-1].y)return points[i-1].y;
      return section.startPoint.y;
    };
    incoming.sort((a,b)=>arrival(a)-arrival(b));
    incoming.forEach((edge,i)=>{node.ports.find(p=>p.id===edge.targets[0]).y=(i+1)*node.bodyHeight/(incoming.length+1)});
  }
  const approach=await elk.layout(approachGraph);
  return [baseline,candidate,approach].sort((a,b)=>wireCrossings(a,true)-wireCrossings(b,true)||wireCrossings(a)-wireCrossings(b))[0];
}
export function alignRailTaps(graph){
  const bus=graph.children.find(node=>node.type==='BUS');
  if(!bus||!bus.ports.length)return graph;
  const right=bus.x+bus.width,gateLeft=Math.min(...graph.children.filter(node=>node!==bus).map(node=>node.x));
  const namesByPort=new Map(bus.ports.map(p=>[p.id,p.name]));
  const pointsOf=edge=>[edge.sections[0].startPoint,...(edge.sections[0].bendPoints||[]),edge.sections[0].endPoint];
  const busEdges=graph.edges.filter(edge=>namesByPort.has(edge.sources[0]));
  const proposals=busEdges.map(edge=>{
    const points=pointsOf(edge),name=namesByPort.get(edge.sources[0]);let index=0;
    // Keep ELK's route past the input corridor, but remove the initial vertical
    // detour by extending the corresponding rail to that route's height.
    for(let i=1;i<points.length-1;i++)if(points[i].x>=right&&points[i].x<gateLeft-8&&points[i].y===points[i+1].y)index=i;
    return {edge,name,points,index};
  });
  const occupied=graph.edges.flatMap(edge=>{const points=pointsOf(edge);return points.slice(1).flatMap((b,i)=>{const a=points[i];return a.y===b.y?[{y:a.y,left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),net:edge.net||edge.sources[0]}]:[]})});
  const taps=[];
  for(const proposal of proposals){
    const {edge,name,points}=proposal;let {index}=proposal;
    if(index){const p=points[index];if(occupied.some(s=>s.net!==name&&Math.abs(s.y-p.y)<4&&s.right>right&&s.left<p.x))index=0}
    const p=points[index],start={x:right,y:p.y};
    const route=[start,...points.slice(index).filter((point,i)=>i!==0||point.x!==right)];
    const id=`bus-${name}-level-${edge.id}`;edge.sources=[id];
    edge.sections[0].startPoint=start;edge.sections[0].bendPoints=route.slice(1,-1);
    taps.push({id,name,x:bus.width,y:p.y,width:0,height:0,layoutOptions:{'elk.port.side':'EAST'}});
    occupied.push({y:p.y,left:right,right:points[index].x,net:name});
  }
  const top=Math.min(bus.y,...taps.map(p=>p.y-50)),bottom=Math.max(bus.y+bus.height,...taps.map(p=>p.y+20));
  bus.y=top;bus.height=bus.bodyHeight=bottom-top;bus.ports=taps.map(p=>({...p,y:p.y-top}));
  // Leave room above the highest tap for input labels.
  const shift=Math.max(0,24-top);
  if(shift){for(const node of graph.children)node.y+=shift;for(const edge of graph.edges)for(const section of edge.sections){section.startPoint.y+=shift;section.endPoint.y+=shift;for(const p of section.bendPoints||[])p.y+=shift}}
  graph.height=Math.max(graph.height+shift,bottom+shift+24);
  return graph;
}
export async function layoutCircuit(tree,variableCount){
  const cacheKey=variableCount||0;
  if(layouts.get(tree)?.has(cacheKey))return layouts.get(tree).get(cacheKey);
  if(!elk){
    if(typeof window==='undefined'){const {default:ELK}=await import('elkjs/lib/elk.bundled.js');elk=new ELK()}
    else elk=new window.ELK({workerUrl:new URL('./vendor/elk-worker.min.js',import.meta.url).href});
  }
  const graph=circuitGraph(tree,variableCount),aliases=[];
  for(const node of graph.children.filter(node=>node.tiedInputs)){
    const first=graph.edges.find(edge=>edge.targets[0]===`${node.id}-in-0`);
    const duplicate=graph.edges.find(edge=>edge.targets[0]===`${node.id}-in-1`);
    aliases.push({first:first.id,duplicate});
    graph.edges=graph.edges.filter(edge=>edge!==duplicate);
  }
  const pending=layoutWithOrderedPins(graph).then(untangleGateApproaches).then(alignRailTaps).then(placed=>{
    for(const {first,duplicate} of aliases){
      const feed=placed.edges.find(edge=>edge.id===first);
      placed.edges.push({...structuredClone(feed),id:duplicate.id,targets:duplicate.targets,sharedFeed:true});
    }
    return placed;
  });
  if(!layouts.has(tree))layouts.set(tree,new Map());layouts.get(tree).set(cacheKey,pending);
  try{return await pending}catch(error){layouts.get(tree).delete(cacheKey);throw error}
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function renderCircuit(graph,palette){
  const {text,muted,line,accent,bg}=palette;
  const paths=graph.edges.filter(edge=>!edge.sharedFeed).flatMap(edge=>(edge.sections||[]).map(section=>({edge,points:[section.startPoint,...(section.bendPoints||[]),section.endPoint]})));
  const bus=graph.children.find(node=>node.type==='BUS'),branchDots=[];
  if(bus){
    bus.inputNames.forEach((name,i)=>{
      const x=bus.x+24+i*26;
      paths.push({edge:{id:`rail-${name}`,sources:[name],targets:[],net:name},points:[{x,y:bus.y+40},{x,y:bus.y+bus.height-16}]});
      for(const p of bus.ports.filter(p=>p.name===name)){
        const y=bus.y+p.y;
        paths.push({edge:{id:`tap-${p.id}`,sources:[name],targets:[p.id],net:name},points:[{x,y},{x:bus.x+p.x,y}]});
        branchDots.push({x,y});
      }
    });
  }
  const netOf=edge=>edge.net||edge.sources[0];
  const segments=paths.flatMap(p=>p.points.slice(1).map((b,i)=>({a:p.points[i],b,net:netOf(p.edge)})));
  const horizontal=segments.filter(s=>s.a.y===s.b.y&&s.a.x!==s.b.x),vertical=segments.filter(s=>s.a.x===s.b.x&&s.a.y!==s.b.y);
  // Crossing nets get a visible wire jump; only actual same-net branches get dots.
  let wires='';
  for(const {edge,points} of paths){
    let d=`M${points[0].x},${points[0].y}`;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      d+=` L${b.x},${b.y}`;
    }
    wires+=`<path data-edge="${edge.id}" data-source="${edge.sources[0]}" data-target="${edge.targets[0]||''}" d="${d}" fill="none" stroke="${muted}" stroke-width="1.7" stroke-linejoin="round"><title>${esc(edge.sources[0])}${edge.targets[0]?' → '+esc(edge.targets[0]):' input rail'}</title></path>`;
  }
  // Paint bridges above every wire, with a background knockout underneath.
  // This avoids later paths painting over jumps, and handles vertical jumps
  // when the intersection is too close to a horizontal bend.
  const crossings=new Map();
  for(const h of horizontal)for(const v of vertical){
    const x=v.a.x,y=h.a.y;
    if(h.net===v.net||x<Math.min(h.a.x,h.b.x)||x>Math.max(h.a.x,h.b.x)||y<Math.min(v.a.y,v.b.y)||y>Math.max(v.a.y,v.b.y))continue;
    const key=`${x}:${y}`;if(crossings.has(key))continue;
    const hx=Math.min(Math.abs(x-h.a.x),Math.abs(x-h.b.x)),vy=Math.min(Math.abs(y-v.a.y),Math.abs(y-v.b.y));
    let d,under;
    if(hx>1){const r=Math.min(5,hx/2);d=`M${x-r},${y} Q${x},${y-8} ${x+r},${y}`;under=`M${x},${Math.max(y-5,Math.min(v.a.y,v.b.y))} V${Math.min(y+5,Math.max(v.a.y,v.b.y))}`}
    else if(vy>1){const r=Math.min(5,vy/2);d=`M${x},${y-r} Q${x+8},${y} ${x},${y+r}`;under=`M${Math.max(x-5,Math.min(h.a.x,h.b.x))},${y} H${Math.min(x+5,Math.max(h.a.x,h.b.x))}`}
    else{
      // Two bends touching: round one bend away from the contact point.
      const turn=vertical.find(s=>s.net===h.net&&s.a.x===x&&(s.a.y===y||s.b.y===y));
      if(!turn)continue;
      const dx=h.a.x===x?1:-1,dy=turn.a.y===y?Math.sign(turn.b.y-y):Math.sign(turn.a.y-y);
      d=`M${x+dx*5},${y} Q${x+dx*5},${y+dy*5} ${x},${y+dy*5}`;
    }
    crossings.set(key,`<g data-wire-crossing="true"><circle cx="${x}" cy="${y}" r="4" fill="${bg}"/>${under?`<path d="${under}" fill="none" stroke="${muted}" stroke-width="1.7"/>`:''}<path d="${d}" fill="none" stroke="${bg}" stroke-width="5"/><path d="${d}" fill="none" stroke="${muted}" stroke-width="1.7"/></g>`);
  }
  const junctions=new Map();
  for(const s of segments)for(const p of [s.a,s.b]){
    const key=`${s.net}:${p.x}:${p.y}`;if(junctions.has(key))continue;
    const directions=new Set();
    for(const t of segments){if(t.net!==s.net)continue;if(t.a.y===t.b.y&&p.y===t.a.y&&p.x>=Math.min(t.a.x,t.b.x)&&p.x<=Math.max(t.a.x,t.b.x)){if(p.x>Math.min(t.a.x,t.b.x))directions.add('W');if(p.x<Math.max(t.a.x,t.b.x))directions.add('E')}if(t.a.x===t.b.x&&p.x===t.a.x&&p.y>=Math.min(t.a.y,t.b.y)&&p.y<=Math.max(t.a.y,t.b.y)){if(p.y>Math.min(t.a.y,t.b.y))directions.add('N');if(p.y<Math.max(t.a.y,t.b.y))directions.add('S')}}
    if(directions.size>=3)junctions.set(key,p);
  }
  let symbols='';
  for(const node of graph.children){
    const {id,x,y,width,bodyHeight:h,type}=node,cy=h/2;
    let body='';
    if(type==='BUS'){
      body=node.inputNames.map((name,i)=>`<text data-input-rail="${name}" x="${24+i*26}" y="22" text-anchor="middle" fill="${accent}" stroke="none" font-size="14">${name}</text>`).join('');
    }else if(type==='INPUT'||type==='CONST'||type==='OUTPUT'){
      body=`<rect width="${width}" height="${h}" rx="6" fill="${bg}" stroke="${type==='OUTPUT'?accent:text}"/><text x="${width/2}" y="${cy+5}" text-anchor="middle" fill="${accent}" stroke="none" font-size="14">${esc(type==='OUTPUT'?'f':node.name??node.value)}</text>`;
    }else{
      const inverted=['NOT','NAND','NOR'].includes(type),isOr=['OR','NOR','XOR'].includes(type);
      if(['AND','NAND'].includes(type))body=`<path d="M12,0 H42 A30,${cy} 0 0 1 42,${h} H12 Z"/>`;
      else if(type==='NOT')body=`<path d="M12,0 L72,${cy} L12,${h} Z"/>`;
      else body=`<path d="M12,0 Q52,0 72,${cy} Q52,${h} 12,${h} Q32,${cy} 12,0 Z"/>${type==='XOR'?`<path d="M7,0 Q27,${cy} 7,${h}" fill="none"/>`:''}`;
      for(const [i,p] of node.ports.filter(p=>p.id.includes('-in-')).entries()){const pinY=node.tiedInputs?(i+1)*h/3:p.y;const boundary=isOr?12+40*(pinY/h)*(1-pinY/h):12;body+=`<path d="M0,${pinY} H${boundary}" fill="none"/>`}
      body+=inverted?`<path d="M72,${cy} H74 M82,${cy} H94" fill="none"/><circle cx="78" cy="${cy}" r="4"/>`:`<path d="M72,${cy} H94" fill="none"/>`;
      body+=`<text x="42" y="${h+17}" text-anchor="middle" fill="${muted}" stroke="none" font-size="10">${type}</text>`;
      if(node.tiedInputs)body=`<g transform="translate(24,0)">${body}</g><path data-local-split="true" d="M0,${cy} H12 M12,${h/3} V${2*h/3} M12,${h/3} H24 M12,${2*h/3} H24" fill="none" stroke="${muted}"/><circle data-junction="true" cx="12" cy="${cy}" r="3" fill="${muted}" stroke="none"/>`;
    }
    symbols+=`<g data-node="${id}" data-type="${type}" transform="translate(${x},${y})" fill="${bg}" stroke="${text}" stroke-width="1.7"><title>${esc(type==='INPUT'?node.name:type)}</title>${body}</g>`;
  }
  const dots=[...junctions.values(),...branchDots].map(p=>`<circle data-junction="true" cx="${p.x}" cy="${p.y}" r="3" fill="${muted}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${graph.width}" height="${graph.height}" viewBox="0 0 ${graph.width} ${graph.height}" role="img" aria-label="Logic circuit for the selected expression" font-family="system-ui,sans-serif"><desc>Signals flow left to right. Dots mark connected wire branches; wire jumps mark crossings without connections. Small output circles indicate inversion.</desc><rect width="100%" height="100%" fill="${bg}"/>${wires}${dots}${[...crossings.values()].join('')}${symbols}</svg>`;
}
export async function circuitSvg(tree,palette,variableCount){return renderCircuit(await layoutCircuit(tree,variableCount),palette)}
