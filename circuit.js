// ELK only lays out this netlist. Gate semantics and SVG rendering stay local.
export function circuitGraph(tree,variableCount){
  const nodes=[],intern=new Map(),edges=[];
  const port=(id,x,y,side)=>({id,x,y,width:0,height:0,layoutOptions:{'elk.port.side':side}});
  function add(t){
    const children=(t.children||[]).map(add),key=t.type+':'+(t.name??t.value??'')+':'+children.map(c=>c.id).join(',');
    if(intern.has(key))return intern.get(key);
    const id='n'+nodes.length,bodyHeight=children.length?Math.max(48,children.length*14+12):32,width=children.length?94:44;
    const node={id,type:t.type,name:t.name,value:t.value,bodyHeight,width,height:bodyHeight+(children.length?24:0),
      layoutOptions:{'elk.portConstraints':'FIXED_POS'},
      ports:[...children.map((_,i)=>port(`${id}-in-${i}`,0,(i+1)*bodyHeight/(children.length+1),'WEST')),port(`${id}-out`,width,bodyHeight/2,'EAST')]};
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
  return {id:'circuit',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.edgeRouting':'ORTHOGONAL','elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES','elk.padding':'[top=24,left=24,bottom=24,right=24]','elk.spacing.nodeNode':'32','elk.spacing.edgeNode':'16','elk.layered.spacing.nodeNodeBetweenLayers':'80','elk.layered.spacing.edgeEdgeBetweenLayers':'12','elk.layered.mergeEdges':'false','elk.randomSeed':'1'},children:[...(bus?[bus]:[]),...nodes.filter(node=>node.type!=='INPUT')],edges};
}
let elk;
const layouts=new WeakMap();
export async function layoutCircuit(tree,variableCount){
  const cacheKey=variableCount||0;
  if(layouts.get(tree)?.has(cacheKey))return layouts.get(tree).get(cacheKey);
  if(!elk){
    if(typeof window==='undefined'){const {default:ELK}=await import('elkjs/lib/elk.bundled.js');elk=new ELK()}
    else elk=new window.ELK({workerUrl:new URL('./vendor/elk-worker.min.js',import.meta.url).href});
  }
  const pending=elk.layout(circuitGraph(tree,variableCount));
  if(!layouts.has(tree))layouts.set(tree,new Map());layouts.get(tree).set(cacheKey,pending);
  try{return await pending}catch(error){layouts.get(tree).delete(cacheKey);throw error}
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function renderCircuit(graph,palette){
  const {text,muted,line,accent,bg}=palette;
  const paths=graph.edges.flatMap(edge=>(edge.sections||[]).map(section=>({edge,points:[section.startPoint,...(section.bendPoints||[]),section.endPoint]})));
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
      if(a.y===b.y&&a.x!==b.x){
        const direction=Math.sign(b.x-a.x),jumps=[...new Set(vertical.filter(v=>v.net!==netOf(edge)&&v.a.x>Math.min(a.x,b.x)+5&&v.a.x<Math.max(a.x,b.x)-5&&a.y>Math.min(v.a.y,v.b.y)&&a.y<Math.max(v.a.y,v.b.y)).map(v=>v.a.x))].sort((x,y)=>direction*(x-y));
        let previous=a.x;
        for(const x of jumps){if(Math.abs(x-previous)<9)continue;d+=` L${x-4*direction},${a.y} Q${x},${a.y-7} ${x+4*direction},${a.y}`;previous=x}
      }
      d+=` L${b.x},${b.y}`;
    }
    wires+=`<path data-edge="${edge.id}" data-source="${edge.sources[0]}" data-target="${edge.targets[0]||''}" d="${d}" fill="none" stroke="${muted}" stroke-width="1.7" stroke-linejoin="round"><title>${esc(edge.sources[0])}${edge.targets[0]?' → '+esc(edge.targets[0]):' input rail'}</title></path>`;
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
      for(const p of node.ports.filter(p=>p.id.includes('-in-'))){const boundary=isOr?12+40*(p.y/h)*(1-p.y/h):12;body+=`<path d="M0,${p.y} H${boundary}" fill="none"/>`}
      body+=inverted?`<path d="M72,${cy} H74 M82,${cy} H94" fill="none"/><circle cx="78" cy="${cy}" r="4"/>`:`<path d="M72,${cy} H94" fill="none"/>`;
      body+=`<text x="42" y="${h+17}" text-anchor="middle" fill="${muted}" stroke="none" font-size="10">${type}</text>`;
    }
    symbols+=`<g data-node="${id}" data-type="${type}" transform="translate(${x},${y})" fill="${bg}" stroke="${text}" stroke-width="1.7"><title>${esc(type==='INPUT'?node.name:type)}</title>${body}</g>`;
  }
  const dots=[...junctions.values(),...branchDots].map(p=>`<circle data-junction="true" cx="${p.x}" cy="${p.y}" r="3" fill="${muted}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${graph.width}" height="${graph.height}" viewBox="0 0 ${graph.width} ${graph.height}" role="img" aria-label="Logic circuit for the selected expression" font-family="system-ui,sans-serif"><desc>Signals flow left to right. Dots mark connected wire branches; wire jumps mark crossings without connections. Small output circles indicate inversion.</desc><rect width="100%" height="100%" fill="${bg}"/>${wires}${dots}${symbols}</svg>`;
}
export async function circuitSvg(tree,palette,variableCount){return renderCircuit(await layoutCircuit(tree,variableCount),palette)}
