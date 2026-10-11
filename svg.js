import {gray,matches} from './logic.js';
export const colors=['#9dca6b','#8ab9ee','#e8a57d','#c09ce8','#6ac7bb','#df92b4','#d6c76b','#acb7bf'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function mapSvg(n,values,cubes=[]){
  const rb=Math.floor(n/2),cb=n-rb,rows=gray(rb),cols=gray(cb),cell=52,left=66,top=48,width=left+cols.length*cell+20,height=top+rows.length*cell+20;
  const label=(i,b)=>b?i.toString(2).padStart(b,'0'):'–';
  let body=`<text x="12" y="19" fill="var(--muted)" font-size="10">${esc(Array.from({length:rb},(_,i)=>String.fromCharCode(65+i)).join('')||'–')} / ${esc(Array.from({length:cb},(_,i)=>String.fromCharCode(65+rb+i)).join(''))}</text>`;
  cols.forEach((c,j)=>body+=`<text x="${left+(j+.5)*cell}" y="30" text-anchor="middle" fill="var(--muted)" font-size="11">${label(c,cb)}</text>`);
  rows.forEach((r,k)=>{body+=`<text x="45" y="${top+(k+.5)*cell+4}" text-anchor="end" fill="var(--muted)" font-size="11">${label(r,rb)}</text>`;cols.forEach((c,j)=>{const i=(r<<cb)|c;body+=`<g class="map-cell" role="button" tabindex="0" data-index="${i}" aria-label="Minterm ${i}, output ${values[i]}. Toggle output."><title>m${i}: ${label(i,n)} → ${values[i]}</title><rect class="cell-bg" x="${left+j*cell}" y="${top+k*cell}" width="${cell}" height="${cell}" fill="var(--panel)" stroke="var(--line)"/><text x="${left+j*cell+7}" y="${top+k*cell+12}" font-size="8" fill="var(--muted)">${i}</text><text x="${left+(j+.5)*cell}" y="${top+(k+.5)*cell+7}" text-anchor="middle" font-size="20" fill="${values[i]?'var(--accent)':'var(--muted)'}">${values[i]}</text></g>`})});
  const runs=indices=>{const result=[];for(const i of indices){const last=result.at(-1);if(last&&last[1]===i-1)last[1]=i;else result.push([i,i])}return result};
  cubes.forEach((cube,index)=>{const rs=rows.flatMap((r,k)=>cols.some(c=>matches(cube,(r<<cb)|c))?[k]:[]),cs=cols.flatMap((c,j)=>rows.some(r=>matches(cube,(r<<cb)|c))?[j]:[]);const rr=runs(rs),cr=runs(cs);const wrap=(rr.length>1&&rs[0]===0&&rs.at(-1)===rows.length-1)||(cr.length>1&&cs[0]===0&&cs.at(-1)===cols.length-1);const inset=4+(index%4)*3;for(const [r0,r1]of rr)for(const[c0,c1]of cr)body+=`<rect pointer-events="none" x="${left+c0*cell+inset}" y="${top+r0*cell+inset}" width="${(c1-c0+1)*cell-inset*2}" height="${(r1-r0+1)*cell-inset*2}" rx="${Math.min(17,cell/2-inset)}" fill="${colors[index%colors.length]}" fill-opacity=".055" stroke="${colors[index%colors.length]}" stroke-width="2" ${wrap?'stroke-dasharray="5 3"':''}><title>Group ${index+1}${wrap?' (continues across opposite edges)':''}</title></rect>`});
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="min-width:${Math.min(width,950)}px" role="img" aria-label="${n} variable Karnaugh map with ${cubes.length} implicant groups" font-family="monospace">${body}</svg>`;
}
export function circuitSvg(tree,palette){
  // Intern identical subexpressions to share inputs and inverter outputs.
  const nodes=[],intern=new Map();
  function add(t){const children=(t.children||[]).map(add),key=t.type+':'+(t.name??t.value??'')+':'+children.map(c=>c.id).join(',');if(intern.has(key))return intern.get(key);const node={...t,children,id:nodes.length,depth:children.length?1+Math.max(...children.map(c=>c.depth)):0};nodes.push(node);intern.set(key,node);return node}
  const output=add(tree),layers=[];nodes.forEach(node=>(layers[node.depth]??=[]).push(node));
  const row=74,margin=40,spacing=170,height=Math.max(180,Math.max(...layers.map(l=>l.length))*row+margin*2),width=(layers.length-1)*spacing+230;
  layers.forEach((layer,d)=>layer.forEach((node,j)=>{node.x=60+d*spacing;node.y=(height-(layer.length-1)*row)/2+j*row}));
  const {text,muted,line,accent,bg}=palette;
  let wires='',symbols='';
  for(const node of nodes){node.children.forEach((c,j)=>{const y=node.y+(j-(node.children.length-1)/2)*Math.min(9,32/Math.max(1,node.children.length-1)),sx=c.x+(c.children.length?65:24),ex=node.x;const bend=sx+(ex-sx)*.5;wires+=`<path d="M${sx},${c.y} H${bend} V${y} H${ex}" fill="none" stroke="${line}" stroke-width="1.4"/>`});
    const x=node.x,y=node.y;
    if(!node.children.length){symbols+=`<rect x="${x-20}" y="${y-15}" width="44" height="30" rx="6" fill="${bg}" stroke="${line}"/><text x="${x+2}" y="${y+5}" text-anchor="middle" fill="${accent}" font-size="14">${esc(node.name??node.value)}</text>`;continue}
    let shape='';
    if(['AND','NAND'].includes(node.type))shape=`<path d="M${x},${y-23} H${x+25} A23,23 0 0 1 ${x+25},${y+23} H${x} Z"/>`;
    else if(node.type==='NOT')shape=`<path d="M${x},${y-23} L${x+46},${y} L${x},${y+23} Z"/>`;
    else shape=`<path d="M${x},${y-23} Q${x+35},${y-25} ${x+52},${y} Q${x+35},${y+25} ${x},${y+23} Q${x+17},${y} ${x},${y-23} Z"/>${node.type==='XOR'?`<path d="M${x-5},${y-23} Q${x+12},${y} ${x-5},${y+23}" fill="none"/>`:''}`;
    const bubble=['NOT','NAND','NOR'].includes(node.type);
    symbols+=`<g fill="${bg}" stroke="${text}" stroke-width="1.6">${shape}${bubble?`<circle cx="${x+56}" cy="${y}" r="4"/>`:''}<path d="M${x+(bubble?60:52)},${y} H${x+65}"/></g><text x="${x+24}" y="${y+39}" text-anchor="middle" fill="${muted}" font-size="9">${node.type}</text>`;
  }
  const end=output.x+(output.children.length?65:24);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Logic circuit for the selected expression" font-family="system-ui,sans-serif"><rect width="100%" height="100%" fill="${bg}"/>${wires}${symbols}<path d="M${end},${output.y} H${width-42}" stroke="${accent}" stroke-width="2"/><text x="${width-32}" y="${output.y+5}" fill="${accent}" font-size="15">f</text></svg>`;
}
