import {gray,matches,names} from './logic.js';
export const colors=['#9dca6b','#8ab9ee','#e8a57d','#c09ce8','#6ac7bb','#df92b4','#d6c76b','#acb7bf'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function timingSignals(n,values){
  return [...names(n).map((name,j)=>({name,values:values.map((_,i)=>(i>>(n-1-j))&1)})),{name:'f',values:[...values]}];
}
export function timingSvg(n,values,palette){
  const {text,muted,line,accent,bg}=palette,signals=timingSignals(n,values);
  const left=66,top=52,slot=40,row=60,width=left+slot*values.length+24,height=top+signals.length*row+26;
  let body=`<rect width="100%" height="100%" fill="${bg}"/><text x="12" y="25" fill="${muted}" font-size="10">Row i</text>`;
  for(let i=0;i<=values.length;i++){
    const x=left+i*slot;
    body+=`<path d="M${x},35 V${height-30}" stroke="${line}" stroke-dasharray="3 5" stroke-width="1"/>`;
    if(i<values.length)body+=`<text x="${x+slot/2}" y="25" text-anchor="middle" fill="${muted}" font-size="10">${i}</text>`;
  }
  signals.forEach((signal,j)=>{
    const high=top+j*row,low=high+28,color=signal.name==='f'?accent:text;
    body+=`<text x="20" y="${high+19}" fill="${color}" font-size="14" font-weight="600">${signal.name}</text><text x="48" y="${high+4}" fill="${muted}" font-size="8">1</text><text x="48" y="${low+4}" fill="${muted}" font-size="8">0</text>`;
    let path=`M${left},${signal.values[0]?high:low}`;
    signal.values.forEach((v,i)=>{const y=v?high:low;if(i&&v!==signal.values[i-1])path+=` V${y}`;path+=` H${left+(i+1)*slot}`});
    body+=`<g data-signal="${signal.name}"><title>${signal.name}: ${signal.values.join(' ')}</title><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></g>`;
  });
  body+=`<text x="${left}" y="${height-8}" fill="${muted}" font-size="10">Time → (equal intervals, ascending truth-table rows)</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Timing diagram of ${names(n).join(', ')} and output f across all ${values.length} truth-table rows" font-family="system-ui,sans-serif"><desc>Ideal signals with no propagation delay. Each interval corresponds to one truth-table row in binary input order. High is 1 and low is 0.</desc>${body}</svg>`;
}
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
export {circuitSvg} from './circuit.js';
