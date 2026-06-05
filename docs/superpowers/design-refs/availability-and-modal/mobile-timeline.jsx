// CampWatch mobile — availability timeline, two screens.
const M_C = {
  paper:'#F4EAD8', cream:'#FBF6EA', ink:'#1A1614', inkSoft:'rgba(26,22,20,0.7)',
  rule:'rgba(26,22,20,0.18)', ruleSoft:'rgba(26,22,20,0.08)',
  forest:'#1F3D2A', forestDeep:'#142a1d', clay:'#B65C3F', mustard:'#C9A227',
  bookedInk:'rgba(26,22,20,0.22)',
};
const M_HEAD='"Big Shoulders Display",sans-serif';
const M_ITAL='"Cormorant Garamond",Georgia,serif';
const M_BODY='"Source Serif 4",Georgia,serif';
const M_MONO='"DM Mono",ui-monospace,monospace';
const M_HAND='"Caveat",cursive';

const START=new Date(2026,4,1), END=new Date(2026,8,30);
const N=Math.round((END-START)/86400000)+1;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS=[[2026,4],[2026,5],[2026,6],[2026,7],[2026,8]];
const NOW=new Date(2026,5,4);
const idxOf=(y,m,d)=>Math.round((new Date(y,m,d)-START)/86400000);
const dateAt=i=>{const d=new Date(START); d.setDate(d.getDate()+i); return d;};
const pct=i=>(i/N)*100;
const R=(y,m,a,b)=>[idxOf(y,m,a),idxOf(y,m,b)];
function buildStatus(open,lim){
  const a=new Array(N).fill(0);
  lim.forEach(([s,e])=>{for(let i=s;i<=e;i++) if(i>=0&&i<N)a[i]=1;});
  open.forEach(([s,e])=>{for(let i=s;i<=e;i++) if(i>=0&&i<N)a[i]=2;});
  return a;
}
const CAMPS=[
  { name:'Outlet Campground', loc:'Redfish Lake · Sawtooth NRA, ID', tier:'fav',
    open:[R(2026,4,23,25),R(2026,5,12,16),R(2026,6,11,14),R(2026,6,24,27),R(2026,7,18,20)],
    lim:[R(2026,5,28,29),R(2026,7,8,9)] },
  { name:'Glacier View', loc:'West Glacier · Glacier NP, MT', tier:'fav',
    open:[R(2026,4,5,11),R(2026,4,26,30),R(2026,6,28,31)], lim:[R(2026,7,14,17)] },
  { name:'Pine Flats', loc:'Lowman · Boise NF, ID', tier:'worth',
    open:[R(2026,5,9,12),R(2026,7,22,25)], lim:[R(2026,6,2,4)] },
  { name:'Stanley Lake', loc:'Stanley · Sawtooth NRA, ID', tier:'other',
    open:[R(2026,7,12,16)], lim:[R(2026,5,20,21),R(2026,6,15,16)] },
];
const TIERS=[
  {key:'fav',   mark:'★', label:'Favorites'},
  {key:'worth', mark:'◇', label:'Worthwhile'},
  {key:'other', mark:'·', label:'Everything else'},
];
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const isWkndNight=i=>{const g=dateAt(i).getDay(); return g===5||g===6;}; // Fri/Sat nights
function hasWeekend(s,e){ for(let i=s;i<=e;i++) if(isWkndNight(i)) return true; return false; }
function fullRange(s,e){
  const ds=dateAt(s),de=dateAt(e);
  if(s===e) return DOW[ds.getDay()]+' '+MON[ds.getMonth()]+' '+ds.getDate();
  return DOW[ds.getDay()]+' '+MON[ds.getMonth()]+' '+ds.getDate()+' – '+DOW[de.getDay()]+' '+MON[de.getMonth()]+' '+de.getDate();
}
function rangeLabel(s,e){
  const ds=dateAt(s),de=dateAt(e);
  if(s===e) return MON[ds.getMonth()]+' '+ds.getDate();
  if(ds.getMonth()===de.getMonth()) return MON[ds.getMonth()]+' '+ds.getDate()+'–'+de.getDate();
  return MON[ds.getMonth()]+' '+ds.getDate()+'–'+MON[de.getMonth()]+' '+de.getDate();
}
const nights=([s,e])=>e-s+1;
const totalOpen=c=>c.open.reduce((a,r)=>a+nights(r),0);
const totalLim=c=>c.lim.reduce((a,r)=>a+nights(r),0);
function nextOpen(c){
  let best=null;
  c.open.forEach(([s,e])=>{ if(best===null||s<best) best=s; });
  return best===null?null:rangeLabel(best,best);
}

/* ── shared month axis (sticky) ── */
function MonthAxis({ pad=14 }) {
  const ni=Math.round((NOW-START)/86400000);
  return (
    <div style={{ position:'relative', height:22, margin:`0 ${pad}px` }}>
      {MONTHS.map(([y,m])=>(
        <div key={m} style={{ position:'absolute', left:pct(idxOf(y,m,1))+'%', bottom:0,
          font:'900 12px/1 '+M_HEAD, textTransform:'uppercase', letterSpacing:'.04em', color:M_C.ink,
          borderLeft:'1px solid '+M_C.rule, paddingLeft:4, height:16 }}>{MON[m]}</div>
      ))}
      <div style={{ position:'absolute', left:pct(ni)+'%', top:-2, bottom:0, width:2, background:M_C.clay }}/>
    </div>
  );
}

/* ── one campground track (compressed full horizon) ── */
function Track({ c, h=30, pad=14 }) {
  const ni=Math.round((NOW-START)/86400000);
  const block=([s,e],kind)=>{
    const left=pct(s), w=Math.max(pct(e-s+1),2.2);
    const segs=[];
    for(let i=s;i<=e;i++){
      const we=isWkndNight(i);
      const bg = kind==='open'
        ? (we ? '#3c7a4f' : M_C.forest)
        : (we ? M_C.mustard : `repeating-linear-gradient(45deg, ${M_C.mustard} 0 4px, rgba(201,162,39,.4) 4px 8px)`);
      segs.push(<div key={i} style={{ flex:1, background:bg }}/>);
    }
    return (
      <div key={kind+s} title={rangeLabel(s,e)} style={{ position:'absolute', top:'50%', transform:'translateY(-50%)',
        left:left+'%', width:w+'%', height:14, borderRadius:4, minWidth:5, overflow:'hidden', display:'flex',
        boxShadow: kind==='open' ? '0 1px 3px -1px rgba(20,42,29,.6)' : '0 1px 3px -2px rgba(201,162,39,.7)' }}>{segs}</div>
    );
  };
  return (
    <div style={{ position:'relative', height:h, margin:`0 ${pad}px`,
      background:M_C.ruleSoft, borderRadius:5, overflow:'hidden' }}>
      {/* weekend (Fri+Sat) shading */}
      {Array.from({length:N},(_,i)=>i).filter(i=>dateAt(i).getDay()===5).map(i=>(
        <div key={'w'+i} style={{ position:'absolute', top:0, bottom:0, left:pct(i)+'%', width:pct(2)+'%', background:'rgba(182,92,63,0.07)' }}/>
      ))}
      {/* month dividers */}
      {MONTHS.map(([y,m],k)=> k===0?null:(
        <div key={m} style={{ position:'absolute', top:0, bottom:0, width:1,
          left:pct(idxOf(y,m,1))+'%', background:'rgba(26,22,20,0.07)' }}/>
      ))}
      {/* now */}
      <div style={{ position:'absolute', top:0, bottom:0, width:2, left:pct(ni)+'%', background:'rgba(182,92,63,0.55)' }}/>
      {c.lim.map(r=>block(r,'limited'))}
      {c.open.map(r=>block(r,'open'))}
    </div>
  );
}

/* ════════════ SCREEN 1 — watchlist glance ════════════ */
function WatchlistScreen({ onOpen }) {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:M_C.paper,
      backgroundImage:'radial-gradient(circle at 10px 10px, rgba(26,22,20,0.02) 0.7px, transparent 0.7px)', backgroundSize:'5px 5px' }}>
      {/* top bar */}
      <div style={{ paddingTop:58, padding:'58px 16px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <svg viewBox="0 0 32 32" width="20" height="20"><path d="M16 5 L5 27 L27 27 Z" fill="none" stroke={M_C.ink} strokeWidth="2.4"/><path d="M16 13 L11 27 L21 27 Z" fill={M_C.ink}/></svg>
            <span style={{ font:'900 16px/1 '+M_HEAD, letterSpacing:'.04em', textTransform:'uppercase', color:M_C.ink }}>CampWatch</span>
          </div>
          <div style={{ width:30, height:30, borderRadius:15, background:M_C.clay, color:M_C.cream, display:'flex', alignItems:'center', justifyContent:'center', font:'700 11px '+M_MONO }}>NL</div>
        </div>
        <div style={{ marginTop:14 }}>
          <div style={{ font:'500 10px/1 '+M_MONO, letterSpacing:'.18em', textTransform:'uppercase', color:M_C.clay }}>§ Your Watchlist</div>
          <h1 style={{ margin:'7px 0 0', font:'900 34px/0.95 '+M_HEAD, textTransform:'uppercase', letterSpacing:'-.01em', color:M_C.ink }}>FOUR PLACES,<br/><span style={{ font:'500 italic 27px/1.0 '+M_ITAL, color:M_C.forest, textTransform:'none' }}>one season.</span></h1>
        </div>
      </div>

      {/* sticky axis */}
      <div style={{ position:'sticky', top:0, zIndex:4, background:M_C.paper, paddingTop:8, paddingBottom:6, borderBottom:'1.5px solid '+M_C.ink }}>
        <MonthAxis/>
      </div>

      {/* rows, grouped by tier */}
      <div style={{ flex:1, overflow:'auto' }}>
        {TIERS.map(t=>{
          const group=CAMPS.filter(c=>c.tier===t.key);
          if(!group.length) return null;
          const markColor = t.key==='fav'?M_C.clay:(t.key==='worth'?M_C.forest:M_C.inkSoft);
          return (
            <div key={t.key}>
              <div style={{ display:'flex', alignItems:'center', gap:9, padding:'12px 16px 9px',
                background:'rgba(31,61,42,0.05)', borderTop:'1px solid '+M_C.rule, borderBottom:'1px solid '+M_C.rule }}>
                <span style={{ font:'700 13px/1 '+M_MONO, color:markColor }}>{t.mark}</span>
                <span style={{ font:'900 12px/1 '+M_HEAD, letterSpacing:'.14em', textTransform:'uppercase', color:M_C.ink, whiteSpace:'nowrap' }}>{t.label}</span>
                <span style={{ font:'500 italic 14px/1 '+M_ITAL, color:M_C.inkSoft, whiteSpace:'nowrap' }}>{group.length} place{group.length>1?'s':''}</span>
                <span style={{ flex:1, height:1, background:M_C.rule }}/>
              </div>
              {group.map(c=>{
                const i=CAMPS.indexOf(c);
                const o=totalOpen(c), l=totalLim(c);
                let pill,pc;
                if(o>0){pill=o+' nts open'; pc={background:M_C.forest,color:'#fff'};}
                else if(l>0){pill='limited'; pc={boxShadow:'inset 0 0 0 1.5px '+M_C.mustard,color:'#7a6212'};}
                else {pill='watching'; pc={border:'1px solid '+M_C.bookedInk,color:M_C.inkSoft};}
                const star = c.tier==='fav' ? <span style={{ color:M_C.clay, marginRight:5 }}>★</span> : null;
                return (
                  <div key={c.name} onClick={()=>onOpen(i)} style={{ padding:'14px 0 16px',
                    borderBottom:'1px dotted '+M_C.rule, cursor:'pointer' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', margin:'0 16px 9px', gap:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ font:'500 italic 20px/1.1 '+M_ITAL, color:M_C.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{star}{c.name}</div>
                        <div style={{ font:'400 10px/1.3 '+M_BODY, color:M_C.inkSoft, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.loc}</div>
                      </div>
                      <span style={{ flexShrink:0, font:'600 9px/1 '+M_MONO, letterSpacing:'.08em', textTransform:'uppercase', padding:'5px 8px', borderRadius:999, whiteSpace:'nowrap', ...pc }}>{pill}</span>
                    </div>
                    <Track c={c}/>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{ padding:'16px', font:'500 italic 14px/1.4 '+M_ITAL, color:M_C.inkSoft, textAlign:'center' }}>
          Last poll · 41s ago. <span style={{ fontFamily:M_HAND, fontWeight:600, color:M_C.clay, fontSize:17 }}>All quiet.</span>
        </div>
      </div>

      {/* hint */}
      <div style={{ padding:'10px 16px', borderTop:'1.5px solid '+M_C.ink, background:M_C.cream,
        font:'500 11px/1.3 '+M_MONO, letterSpacing:'.06em', textTransform:'uppercase', color:M_C.inkSoft, textAlign:'center' }}>
        Tap a row for exact dates →
      </div>
    </div>
  );
}

/* ════════════ SCREEN 2 — campground detail ════════════ */
function MiniCal({ c, y, m }) {
  const cells=[];
  ['M','T','W','T','F','S','S'].forEach((d,i)=>{
    const we=(i===4||i===5); // Fri, Sat columns
    cells.push(<div key={'h'+i} style={{ textAlign:'center', font:'700 8px/1 '+M_MONO,
      color: we?'#7a4a39':M_C.inkSoft, background: we?'rgba(182,92,63,0.09)':'transparent', borderRadius:3, padding:'2px 0' }}>{d}</div>);
  });
  const first=new Date(y,m,1).getDay(); const off=(first+6)%7;
  for(let i=0;i<off;i++) cells.push(<div key={'o'+i}/>);
  const dim=new Date(y,m+1,0).getDate();
  // status lookup
  const status=buildStatus(c.open,c.lim);
  for(let day=1;day<=dim;day++){
    const idx=idxOf(y,m,day);
    const s=(idx<0||idx>=N)?0:status[idx];
    const col=(off+day-1)%7;
    const we=(col===4||col===5); // Fri/Sat
    let st={ aspectRatio:'1', display:'flex', alignItems:'center', justifyContent:'center',
      font:'500 11px/1 '+M_MONO, borderRadius:'50%', color:M_C.inkSoft };
    if(s===2) st={...st, background:M_C.forest, color:M_C.cream, fontWeight:600};
    else if(s===1) st={...st, boxShadow:'inset 0 0 0 2px '+M_C.mustard, color:'#7a6212', fontWeight:600};
    else st={...st, color:'rgba(26,22,20,0.3)', background: we?'rgba(182,92,63,0.07)':'transparent', borderRadius:we?5:'50%'};
    cells.push(<div key={day} style={st}>{day}</div>);
  }
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ font:'900 14px/1 '+M_HEAD, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8, paddingBottom:5, borderBottom:'1px solid '+M_C.rule, color:M_C.ink }}>{MON[m]} {y}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>{cells}</div>
    </div>
  );
}

function DetailScreen({ idx, onBack }) {
  const c=CAMPS[idx];
  const tier=TIERS.find(t=>t.key===c.tier);
  const o=totalOpen(c), l=totalLim(c);
  const status=buildStatus(c.open,c.lim);
  const activeMonths=MONTHS.filter(([y,m])=>{
    const dim=new Date(y,m+1,0).getDate();
    for(let d=1;d<=dim;d++){const i=idxOf(y,m,d); if(i>=0&&i<N&&status[i]>0)return true;}
    return false;
  });
  const quiet=MONTHS.length-activeMonths.length;
  // openings list (open + limited), sorted
  const items=c.open.map(r=>({r,k:'open'})).concat(c.lim.map(r=>({r,k:'lim'}))).sort((a,b)=>a.r[0]-b.r[0]);
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:M_C.paper,
      backgroundImage:'radial-gradient(circle at 10px 10px, rgba(26,22,20,0.02) 0.7px, transparent 0.7px)', backgroundSize:'5px 5px' }}>
      {/* top bar */}
      <div style={{ paddingTop:56, padding:'56px 16px 14px', borderBottom:'1.5px solid '+M_C.ink }}>
        <div onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:6, font:'600 11px/1 '+M_MONO, letterSpacing:'.12em', textTransform:'uppercase', color:M_C.clay, cursor:'pointer', marginBottom:11 }}>
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" stroke={M_C.clay} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Watchlist
        </div>
        <div>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 9px', borderRadius:999,
            background: c.tier==='fav'?'rgba(182,92,63,0.12)':'rgba(26,22,20,0.05)' }}>
            <span style={{ font:'700 11px/1 '+M_MONO, color: c.tier==='fav'?M_C.clay:(c.tier==='worth'?M_C.forest:M_C.inkSoft) }}>{tier.mark}</span>
            <span style={{ font:'700 9px/1 '+M_MONO, letterSpacing:'.12em', textTransform:'uppercase', color:M_C.ink }}>{tier.label}</span>
          </span>
        </div>
        <div style={{ font:'500 10px/1 '+M_MONO, letterSpacing:'.16em', textTransform:'uppercase', color:M_C.clay, marginTop:11 }}>{c.loc}</div>
        <h1 style={{ margin:'8px 0 0', font:'900 30px/1.0 '+M_HEAD, textTransform:'uppercase', letterSpacing:'-.01em', color:M_C.ink, textWrap:'balance' }}>{c.name}</h1>
        <div style={{ marginTop:12, display:'flex', alignItems:'baseline', gap:9 }}>
          <span style={{ font:'900 28px/1 '+M_HEAD, color:M_C.forest }}>{o>0?o:l}</span>
          <span style={{ font:'500 italic 16px/1.15 '+M_ITAL, color:M_C.inkSoft }}>{o>0?'nights open across the season':'limited nights only'}</span>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'18px 16px 16px' }}>
        {/* full-width single track, taller */}
        <div style={{ font:'500 10px/1 '+M_MONO, letterSpacing:'.16em', textTransform:'uppercase', color:M_C.clay, marginBottom:8 }}>This season</div>
        <MonthAxis pad={0}/>
        <div style={{ marginTop:4, marginBottom:20 }}><Track c={c} h={34} pad={0}/></div>

        {/* openings list */}
        <div style={{ font:'500 10px/1 '+M_MONO, letterSpacing:'.16em', textTransform:'uppercase', color:M_C.clay, marginBottom:10 }}>Open windows</div>
        <div style={{ marginBottom:24 }}>
          {items.map(({r,k},i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:11, padding:'11px 0', borderTop:i===0?'none':'1px dotted '+M_C.rule }}>
              <span style={{ width:12, height:12, borderRadius:3, flexShrink:0,
                background: k==='open'?M_C.forest:`repeating-linear-gradient(45deg, ${M_C.mustard} 0 3px, rgba(201,162,39,.4) 3px 6px)` }}/>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
                  <div style={{ font:'600 15px/1.2 '+M_BODY, color:M_C.ink }}>{fullRange(r[0],r[1])}</div>
                  {hasWeekend(r[0],r[1]) && (
                    <span style={{ font:'600 8px/1 '+M_MONO, letterSpacing:'.1em', textTransform:'uppercase', color:'#2f6b43', border:'1px solid #3c7a4f', borderRadius:999, padding:'3px 6px' }}>incl. weekend</span>
                  )}
                </div>
                <div style={{ font:'500 italic 13px/1 '+M_ITAL, color:M_C.inkSoft, marginTop:3 }}>{nights(r)} night{nights(r)>1?'s':''} · {k==='open'?'bookable now':'1–2 sites'}</div>
              </div>
              <svg width="7" height="12" viewBox="0 0 7 12"><path d="M1 1 L6 6 L1 11" stroke={M_C.bookedInk} strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>
            </div>
          ))}
        </div>

        {/* calendars — only active months */}
        <div style={{ font:'500 10px/1 '+M_MONO, letterSpacing:'.16em', textTransform:'uppercase', color:M_C.clay, marginBottom:12 }}>By the calendar</div>
        {activeMonths.map(([y,m])=> <MiniCal key={m} c={c} y={y} m={m}/>)}
        {quiet>0 && (
          <div style={{ font:'500 italic 14px/1.4 '+M_ITAL, color:M_C.inkSoft, paddingTop:4 }}>
            + {quiet} quiet month{quiet>1?'s':''} hidden <span style={{ fontFamily:M_HAND, fontWeight:600, color:M_C.clay, fontSize:16 }}>(nothing open)</span>
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ padding:'12px 16px', borderTop:'1.5px solid '+M_C.ink, background:M_C.cream }}>
        <div style={{ background:M_C.forest, color:M_C.cream, borderRadius:3, padding:'15px 0', textAlign:'center',
          font:'800 13px/1 '+M_HEAD, letterSpacing:'.14em', textTransform:'uppercase' }}>Book on recreation.gov →</div>
      </div>
    </div>
  );
}

/* ════════════ harness — two phones ════════════ */
function MobileShowcase() {
  const [openIdx,setOpenIdx]=React.useState(0); // detail phone shows Outlet by default
  return (
    <div style={{ display:'flex', gap:56, justifyContent:'center', flexWrap:'wrap', alignItems:'flex-start' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
        <IOSDevice width={344} height={730}>
          <WatchlistScreen onOpen={setOpenIdx}/>
        </IOSDevice>
        <div style={{ font:'500 italic 18px/1.3 '+M_ITAL, color:M_C.inkSoft, textAlign:'center', maxWidth:300 }}>
          <b style={{ fontFamily:M_HAND, fontWeight:600, color:M_C.clay, fontStyle:'normal', fontSize:21 }}>At a glance.</b><br/>
          Grouped favorites → worthwhile → the rest, all sharing one axis. Brighter segments are Fri/Sat nights — so weekend openings pop. Tap any row.
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
        <IOSDevice width={344} height={730}>
          <DetailScreen idx={openIdx} onBack={()=>{}}/>
        </IOSDevice>
        <div style={{ font:'500 italic 18px/1.3 '+M_ITAL, color:M_C.inkSoft, textAlign:'center', maxWidth:300 }}>
          <b style={{ fontFamily:M_HAND, fontWeight:600, color:M_C.clay, fontStyle:'normal', fontSize:21 }}>Tap for detail.</b><br/>
          Exact windows with day-of-week and an “incl. weekend” tag, plus only-the-relevant-month calendars (Fri/Sat columns shaded) and a one-tap booking link.
        </div>
      </div>
    </div>
  );
}

window.MobileShowcase = MobileShowcase;
