import {gray,matches,names} from './logic.js';
export const colors=['#9dca6b','#8ab9ee','#e8a57d','#c09ce8','#6ac7bb','#df92b4','#d6c76b','#acb7bf',
  '#f28c8c','#69bde0','#b9b66a','#a699ed','#66bf95','#e5a4cc','#dfb16a','#83a3ce',
  '#c5a779','#b2cf87','#77b7b3','#d88fbf','#a8aee7','#e2ba8c','#96bca4','#c0a0b4'];
const outlineStyles=[['solid',''],['dashed','7 4'],['dotted','0 5'],['dash-dot','9 4 0 4'],['dash-dot-dot','9 4 0 4 0 4'],['short-dash','3 4'],
  ['long-dash','14 5'],['dense-dot','0 3.5'],['sparse-dot','0 8'],['long-dash-dot','15 5 0 5'],
  ['alternating-dash','12 4 3 4'],['dash-three-dots','10 4 0 4 0 4 0 4'],['short-dash-dot','4 4 0 4']];
export function groupOutline(index){
  const [name,dash]=outlineStyles[index%outlineStyles.length];
  return {name,attributes:`stroke-linecap="round"${dash?` stroke-dasharray="${dash}"`:''}`};
}
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
    let path='',unknown='';
    signal.values.forEach((v,i)=>{
      const x=left+i*slot;
      if(v==='X'){
        unknown+=`<g data-unknown-row="${i}"><rect x="${x}" y="${high}" width="${slot}" height="28" fill="${color}" fill-opacity=".1"/><path d="M${x},${high} L${x+slot},${low} M${x},${low} L${x+slot},${high}" stroke="${color}" stroke-width="1"/><text x="${x+slot/2}" y="${low+13}" text-anchor="middle" fill="${color}" font-size="9">X</text></g>`;return;
      }
      const y=v===1?high:low;
      if(i===0||signal.values[i-1]==='X')path+=` M${x},${y}`;
      else if(v!==signal.values[i-1])path+=` V${y}`;
      path+=` H${x+slot}`;
    });
    body+=`<g data-signal="${signal.name}"><title>${signal.name}: ${signal.values.join(' ')}</title>${unknown}<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></g>`;
  });
  body+=`<text x="${left}" y="${height-8}" fill="${muted}" font-size="10">Time → (equal intervals, ascending truth-table rows)</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Timing diagram of ${names(n).join(', ')} and output f across all ${values.length} truth-table rows" font-family="system-ui,sans-serif"><desc>Ideal signals with no propagation delay. Each interval corresponds to one truth-table row in binary input order. High is 1 and low is 0. Crossed X bands indicate unspecified outputs.</desc>${body}</svg>`;
}
export function mapSvg(n,values,cubes=[]){
  const rb=Math.floor(n/2),cb=n-rb,rows=gray(rb),cols=gray(cb),cell=52,left=66,top=48,width=left+cols.length*cell+20,height=top+rows.length*cell+20;
  const label=(i,b)=>b?i.toString(2).padStart(b,'0'):'–';
  let body=`<text x="12" y="19" fill="var(--muted)" font-size="10">${esc(Array.from({length:rb},(_,i)=>String.fromCharCode(65+i)).join('')||'–')} / ${esc(Array.from({length:cb},(_,i)=>String.fromCharCode(65+rb+i)).join(''))}</text>`;
  cols.forEach((c,j)=>body+=`<text x="${left+(j+.5)*cell}" y="30" text-anchor="middle" fill="var(--muted)" font-size="11">${label(c,cb)}</text>`);
  rows.forEach((r,k)=>{body+=`<text x="45" y="${top+(k+.5)*cell+4}" text-anchor="end" fill="var(--muted)" font-size="11">${label(r,rb)}</text>`;cols.forEach((c,j)=>{const i=(r<<cb)|c;body+=`<g class="map-cell" role="button" tabindex="0" data-index="${i}" aria-label="Minterm ${i}, output ${values[i]}. Cycle 0, 1, X."><title>m${i}: ${label(i,n)} → ${values[i]}</title><rect class="cell-bg" x="${left+j*cell}" y="${top+k*cell}" width="${cell}" height="${cell}" fill="var(--panel)" stroke="var(--line)"/><text x="${left+j*cell+7}" y="${top+k*cell+12}" font-size="8" fill="var(--muted)">${i}</text><text x="${left+(j+.5)*cell}" y="${top+(k+.5)*cell+7}" text-anchor="middle" font-size="20" fill="${values[i]===1?'var(--accent)':values[i]==='X'?'var(--dont-care)':'var(--muted)'}">${values[i]}</text></g>`})});
  const runs=indices=>{const result=[];for(const i of indices){const last=result.at(-1);if(last&&last[1]===i-1)last[1]=i;else result.push([i,i])}return result};
  cubes.forEach((cube,index)=>{
    const rs=rows.flatMap((r,k)=>cols.some(c=>matches(cube,(r<<cb)|c))?[k]:[]),cs=cols.flatMap((c,j)=>rows.some(r=>matches(cube,(r<<cb)|c))?[j]:[]);
    const rr=runs(rs),cr=runs(cs),split=rr.length>1||cr.length>1,inset=4+(index%4)*3,color=colors[index%colors.length],outline=groupOutline(index);
    for(const [r0,r1]of rr)for(const[c0,c1]of cr){
      // Open the outline toward the other fragments of this implicant. At
      // opposite map edges this produces matching half-loops; internal gaps
      // in larger Gray-code maps use the same continuation convention.
      const wrapX=cr.length>1&&cs[0]===0&&cs.at(-1)===cols.length-1,wrapY=rr.length>1&&rs[0]===0&&rs.at(-1)===rows.length-1;
      const west=cr.length>1&&(wrapX?c0===0:c0>cs[0]);
      const east=cr.length>1&&(wrapX?c1===cols.length-1:c1<cs.at(-1));
      const north=rr.length>1&&(wrapY?r0===0:r0>rs[0]);
      const south=rr.length>1&&(wrapY?r1===rows.length-1:r1<rs.at(-1));
      const x=left+c0*cell+(west?0:inset),y=top+r0*cell+(north?0:inset),right=left+(c1+1)*cell-(east?0:inset),bottom=top+(r1+1)*cell-(south?0:inset);
      const radius=Math.min(17,cell/2-inset,(right-x)/2,(bottom-y)/2);
      let d='';
      if(!north)d+=`M${x+(west?0:radius)},${y} H${right-(east?0:radius)} `;
      if(!east)d+=`M${right},${y+(north?0:radius)} V${bottom-(south?0:radius)} `;
      if(!south)d+=`M${right-(east?0:radius)},${bottom} H${x+(west?0:radius)} `;
      if(!west)d+=`M${x},${bottom-(south?0:radius)} V${y+(north?0:radius)} `;
      if(!north&&!west)d+=`M${x},${y+radius} A${radius},${radius} 0 0 1 ${x+radius},${y} `;
      if(!north&&!east)d+=`M${right-radius},${y} A${radius},${radius} 0 0 1 ${right},${y+radius} `;
      if(!south&&!east)d+=`M${right},${bottom-radius} A${radius},${radius} 0 0 1 ${right-radius},${bottom} `;
      if(!south&&!west)d+=`M${x+radius},${bottom} A${radius},${radius} 0 0 1 ${x},${bottom-radius} `;
      body+=`<g pointer-events="none" data-map-group="${index+1}" data-continuation="${[north?'north':'',east?'east':'',south?'south':'',west?'west':''].filter(Boolean).join(' ')}"><title>Group ${index+1}${split?' (matching open ends belong to the same term)':''}</title><rect x="${x}" y="${y}" width="${right-x}" height="${bottom-y}" rx="${split?0:radius}" fill="${color}" fill-opacity=".055"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${outline.attributes}/></g>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="min-width:${Math.min(width,950)}px" role="img" aria-label="${n} variable Karnaugh map with ${cubes.length} implicant groups" font-family="monospace">${body}</svg>`;
}
export {circuitSvg} from './circuit.js';
