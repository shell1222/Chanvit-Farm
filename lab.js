/* ============================================================
   LAB TAB — ผลแลปจาก Unify (จ.), CP (อ.), Unity (ศ.)
   ข้อมูลอยู่ใน lab-data.json (แยกจากข้อมูลฟาร์มใน Firebase)
   ============================================================ */
(function(){
const LAB_CO = {
  unify:{n:'Unify', day:'จันทร์', color:'#2f5d8a'},
  cp:{n:'CP', day:'อังคาร', color:'#1f8a4c'},
  unity:{n:'Unity', day:'ศุกร์', color:'#a8326e'},
};
const TYPE_LABEL = {
  cp_water:'คุณภาพน้ำ + เชื้อในน้ำ', cp_shrimp:'เชื้อในตับกุ้ง',
  unify_health:'สุขภาพกุ้ง (ตารางสรุปทุกบ่อ)', unify_tcbs:'เชื้อบนอาหาร TCBS (น้ำ + ตับ)', unify_pond:'ใบรายงานรายบ่อ (PDF)',
  unity_health:'ใบแจ้งผลตรวจสุขภาพกุ้ง', unity_plates:'จานเพาะเชื้อตับ',
};
const TYPE_ORDER = ['cp_water','cp_shrimp','unify_health','unify_tcbs','unify_pond','unity_health','unity_plates'];

// เกณฑ์: เชื้อใช้ตามที่แต่ละบริษัทระบุ / สีในรายงาน CP · สุขภาพตับเป็นค่าตั้งต้น ปรับได้ที่นี่
const C = {
  cpWater:{alk:v=>v>=120, nh3:v=>v<=1, no2:v=>v<=0.5, om:v=>v<=10, ntu:v=>v>=4&&v<=10, y:v=>v<1000, g:v=>v<100, t:v=>v<1100},
  cpShrimp:{g:v=>v<100, y:v=>v<1000, t:v=>v<1100},
  unifyWater:v=>v<=1000, unifyLiver:v=>v<=100000,
  health:{fat:v=>v>=80, atm:v=>v<=10, ehp:v=>v<=10, spore:v=>v<=0, gut:v=>v<=10, atrophy:v=>v<=10},
};
const BAD_LIVER_TXT = /บวม|อักเสบ|30%/;

let DATA = null, loading = null, curView = 'co', curCo = 'cp', curPond = null;
const sel = {}; // วันที่ที่เลือกต่อ type

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thDate = iso => { const [y,m,d] = iso.split('-').map(Number); return `${d} ${TH_MONTH[m-1]} ${String(y+543).slice(-2)}`; };
const sci = v => { if(v==null) return '–'; if(v===0) return 'ND'; const e=Math.floor(Math.log10(v)); if(e<1) return String(v);
  const m=+(v/10**e).toFixed(2); return (m===1?'':m+'×')+`10<sup>${e}</sup>`; };
const fix = (v,d) => v==null ? '–' : (d!=null ? Number(v).toFixed(d) : v);
const pct = v => v==null ? '–' : v+'%';
const cell = (v,test,show,cls='') => v==null ? `<td class="lab-na">–</td>`
  : `<td class="${cls} ${test ? (test(v)?'lab-ok':'lab-bad') : ''}">${show ?? esc(v)}</td>`;
const txtCell = (v,bad) => v==null||v==='' ? `<td class="lab-na">–</td>` : `<td class="${bad?'lab-bad':''}">${esc(v)}</td>`;

const reportsOf = type => (DATA ? DATA.reports.filter(r=>r.type===type) : []).sort((a,b)=>a.date<b.date?1:-1);
const latest = type => reportsOf(type)[0] || null;
const current = type => { const list=reportsOf(type); return list.find(r=>r.date===sel[type]) || list[0] || null; };
const rowOf = (rep,p) => rep ? rep.rows.find(r=>r.pond===p) : null;

/* ---------- โหลดข้อมูล ---------- */
function load(){
  if(DATA) return Promise.resolve(DATA);
  if(loading) return loading;
  loading = fetch('lab-data.json', {cache:'no-store'})
    .then(r => { if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => (DATA = j))
    .catch(e => { loading = null; throw e; });
  return loading;
}

/* ---------- ตารางตามประเภทรายงาน ---------- */
const RENDER = {
  cp_water(rep){ const c=C.cpWater;
    return `<div class="lab-tw"><table class="lab-t"><thead>
      <tr><th rowspan="2">บ่อ</th><th rowspan="2">อายุ<small>วัน</small></th><th class="lab-grp" colspan="9">คุณภาพน้ำ</th><th rowspan="2">ความขุ่นใส<small>NTU</small></th><th class="lab-grp" colspan="3">เชื้อในน้ำ <small>CFU/ml</small></th></tr>
      <tr><th>ความเค็ม<small>ppt</small></th><th>pH</th><th>อัลคาไลน์</th><th>แอมโมเนีย</th><th>ไนไตรท์</th><th>แคลเซียม</th><th>แมกนีเซียม</th><th>โพแทสเซียม</th><th>สารอินทรีย์</th><th>เขียว GVC</th><th>เหลือง YVC</th><th>รวม TVC</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td><td>${fix(r.age)}</td><td>${fix(r.salinity)}</td>${cell(r.ph)}${cell(r.alk,c.alk)}${cell(r.nh3,c.nh3,fix(r.nh3,2))}${cell(r.no2,c.no2,fix(r.no2,2))}${cell(r.ca)}${cell(r.mg)}${cell(r.k)}${cell(r.om,c.om)}${cell(r.ntu,c.ntu,fix(r.ntu,2))}${cell(r.gvc,c.g,sci(r.gvc),'lab-v')}${cell(r.yvc,c.y,sci(r.yvc),'lab-v')}${cell(r.tvc,c.t,sci(r.tvc),'lab-v')}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ (อ่านจากสีในรายงาน CP): อัลคาไลน์ ≥ 120 · สารอินทรีย์ ≤ 10 · ความขุ่น 4–10 NTU · เชื้อเหลือง &lt; 10<sup>3</sup> · เชื้อเขียว &lt; 10<sup>2</sup></p>`;
  },
  cp_shrimp(rep){ const c=C.cpShrimp;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th>บ่อ</th><th>อายุ<small>วัน</small></th><th>เขียว GVC</th><th>เหลือง YVC</th><th>รวม TVC</th><th>น้ำหนักเฉลี่ย<small>กรัม/ตัว</small></th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td><td>${fix(r.age)}</td>${cell(r.gvc,c.g,sci(r.gvc),'lab-v')}${cell(r.yvc,c.y,sci(r.yvc),'lab-v')}${cell(r.tvc,c.t,sci(r.tvc),'lab-v')}${cell(r.weight)}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ CP: GVC &lt; 10<sup>2</sup> · YVC &lt; 10<sup>3</sup> · TVC &lt; 1.1×10<sup>3</sup> CFU/ml</p>`;
  },
  unify_health(rep){ const c=C.health;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th rowspan="2">บ่อ</th><th rowspan="2">อายุ</th><th rowspan="2">ไซส์<small>ตัว/กก.</small></th><th rowspan="2">นน.เฉลี่ย<small>กรัม</small></th><th rowspan="2">PDG<small>ก./วัน</small></th><th class="lab-grp" colspan="7">ตับ</th><th rowspan="2">ขาว่ายน้ำ</th><th rowspan="2">เหงือก</th></tr>
      <tr><th>% ไขมัน</th><th>ATM</th><th>ฝ่อ/คอด</th><th>รอยอักเสบ</th><th>ตัวอ่อน EHP</th><th>สปอร์ EHP</th><th>ลำไส้อักเสบ</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td><td>${fix(r.age)}</td><td>${r.size!=null?r.size.toLocaleString():'–'}</td><td>${fix(r.weight,2)}</td>${cell(r.pdg,null,fix(r.pdg,2))}${cell(r.fat,c.fat,pct(r.fat))}${cell(r.atm,c.atm,pct(r.atm))}${cell(r.atrophy,c.atrophy,pct(r.atrophy))}${cell(r.lesion,null,pct(r.lesion))}${cell(r.ehp,c.ehp,pct(r.ehp))}${cell(r.spore,c.spore,pct(r.spore))}${cell(r.gut,c.gut,pct(r.gut))}${txtCell(r.leg)}${txtCell(r.gill, r.gill && r.gill!=='ปกติ')}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ตั้งต้น: ไขมัน ≥ 80% · ATM ≤ 10% · ฝ่อ/คอด ≤ 10% · ตัวอ่อน EHP ≤ 10% · ลำไส้อักเสบ ≤ 10%</p>`;
  },
  unify_tcbs(rep){
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th rowspan="2">บ่อ</th><th class="lab-grp" colspan="2">เชื้อในน้ำ <small>CFU/ml</small></th><th class="lab-grp" colspan="2">เชื้อในตับ <small>CFU/g</small></th></tr><tr><th>เหลือง</th><th>เขียว</th><th>เหลือง</th><th>เขียว</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${cell(r.waterY,C.unifyWater,sci(r.waterY),'lab-v')}${cell(r.waterG,C.unifyWater,sci(r.waterG),'lab-v')}${cell(r.liverY,C.unifyLiver,sci(r.liverY),'lab-v')}${cell(r.liverG,C.unifyLiver,sci(r.liverG),'lab-v')}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ Unify: ในน้ำ ≤ 10<sup>3</sup> CFU/ml · ในตับ ≤ 10<sup>5</sup> CFU/g</p>`;
  },
  unify_pond(rep){ const c=C.health;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th>บ่อ</th><th>อายุ</th><th>นน.เฉลี่ย</th><th>ไซส์</th><th>% ไขมัน</th><th>ATM</th><th>ฝ่อ/คอด</th><th>ไขมันเป็นก้อน</th><th>รอยอักเสบ</th><th>ตัวอ่อน EHP</th><th>สปอร์ EHP</th><th>ลำไส้อักเสบ</th><th>เหงือก</th><th>ขาว่ายน้ำ</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td><td>${fix(r.age)}</td><td>${fix(r.weight,2)}</td><td>${fix(r.size)}</td>${cell(r.fat,c.fat,pct(r.fat))}${cell(r.atm,c.atm,pct(r.atm))}${cell(r.atrophy,c.atrophy,pct(r.atrophy))}${cell(r.fatLump,null,pct(r.fatLump))}${cell(r.lesion,null,pct(r.lesion))}${cell(r.ehp,c.ehp,pct(r.ehp))}${cell(r.spore,c.spore,pct(r.spore))}${cell(r.gut,c.gut,pct(r.gut))}${txtCell(r.gill, r.gill && r.gill!=='ปกติ')}${txtCell(r.leg)}</tr>`).join('')+
      `</tbody></table></div>`;
  },
  unity_health(rep){ const c=C.health;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th>บ่อ</th><th>ระดับไขมัน</th><th>พูตับ / ผนังตับ</th><th>ATM</th><th>เมลานิน</th><th>ตัวอ่อน EHP</th><th>สปอร์ EHP</th><th>ลำไส้</th><th>เหงือก / ภายนอก</th><th>คำแนะนำ</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${txtCell(r.fat, parseInt(r.fat)<80)}<td class="lab-wrap ${BAD_LIVER_TXT.test(r.liver||'')?'lab-bad':''}">${esc(r.liver||'–')}</td>${cell(r.atm,c.atm,pct(r.atm))}${cell(r.melanin,null,pct(r.melanin))}${cell(r.ehp,c.ehp,pct(r.ehp))}${cell(r.spore,c.spore,pct(r.spore))}${txtCell(r.gut, r.gut==='อักเสบ')}${txtCell(r.outside, !!r.outside)}<td class="lab-wrap">${esc(r.advice||'–')}</td></tr>`).join('')+
      `</tbody></table></div>${rep.note?`<p class="lab-note">${esc(rep.note)} · ค่าที่อ่านไม่ชัดจะถามก่อนลงข้อมูล</p>`:''}`;
  },
  unity_plates(rep){
    return `<div class="lab-plates">`+rep.rows.map(r=>`<div><div class="lab-plate ${r.liver==='yellow'?'y':''}">${esc(r.pond)}</div>${r.liver==='yellow'?'มีโคโลนีเหลือง':'ไม่พบ'}</div>`).join('')+
      `</div><p class="lab-crit">Unity ส่งเป็นรูปจาน ไม่มีตัวเลข เก็บไว้เป็นข้อสังเกต</p>`;
  },
};
function adviceHtml(rep, pond){
  const list = (rep.advice||[]).filter(a=>!pond || a.ponds.includes(pond));
  if(!list.length) return '';
  const color = LAB_CO[rep.company].color;
  return list.map(a=>`<div class="lab-advice" style="border-color:${color}"><b>คำแนะนำ ${LAB_CO[rep.company].n} · บ่อ ${a.ponds.join(', ')}</b>${esc(a.text)}</div>`).join('');
}

/* ---------- มุมมองตามบริษัท ---------- */
function coView(){
  const chips = Object.entries(LAB_CO).map(([k,c])=>`<button class="lab-chip" aria-pressed="${k===curCo}" onclick="labSetCo('${k}')"><i class="lab-dot" style="background:${c.color}"></i>${c.n} · ${c.day}</button>`).join('');
  const types = TYPE_ORDER.filter(t=>t.startsWith(curCo+'_'));
  const blocks = types.map(t=>{
    const list = reportsOf(t); if(!list.length) return '';
    const rep = current(t);
    const dateSel = list.length>1
      ? `<select class="lab-date-sel" onchange="labSetDate('${t}',this.value)">${list.map(r=>`<option value="${r.date}" ${r===rep?'selected':''}>${thDate(r.date)}</option>`).join('')}</select>`
      : `<span class="lab-date">${thDate(rep.date)}</span>`;
    return `<div class="lab-rep"><h3>${TYPE_LABEL[t]} ${dateSel}</h3>${RENDER[t](rep)}${adviceHtml(rep)}</div>`;
  }).join('') || '<p class="hint">ยังไม่มีผลของบริษัทนี้</p>';
  const c = LAB_CO[curCo];
  return `<div class="lab-chips">${chips}</div>
    <div class="card"><div class="lab-co-head"><b><i class="lab-dot" style="background:${c.color}"></i>${c.n}</b><span class="hint">ตรวจทุกวัน${c.day}</span></div>${blocks}</div>`;
}

/* ---------- มุมมองตามบ่อ ---------- */
function allPonds(){
  const set = new Set(); DATA.reports.forEach(r=>r.rows.forEach(x=>set.add(x.pond)));
  const order = (typeof STATE!=='undefined' && STATE.ponds || []).map(p=>p.id);
  return [...set].sort((a,b)=>{ const ia=order.indexOf(a), ib=order.indexOf(b);
    if(ia>=0&&ib>=0) return ia-ib; if(ia>=0) return -1; if(ib>=0) return 1;
    return a.localeCompare(b,'th',{numeric:true}); });
}
function tile(k,val,u,ok,src){ return `<div class="lab-tile ${ok==null?'':ok?'ok':'bad'}"><div class="k">${k}</div><div class="val">${val}<span class="u"> ${u||''}</span></div>${src?`<div class="src">${src}</div>`:''}</div>`; }
function pondView(){
  const ponds = allPonds();
  if(!curPond || !ponds.includes(curPond)) curPond = ponds[0];
  const p = curPond, out = [];
  out.push(`<div class="lab-chips">${ponds.map(x=>`<button class="lab-chip" aria-pressed="${x===p}" onclick="labSetPond('${esc(x)}')">บ่อ ${esc(x)}</button>`).join('')}</div>`);

  const cwRep = latest('cp_water'), cw = rowOf(cwRep,p), c = C.cpWater;
  out.push(`<div class="card"><h3>คุณภาพน้ำ ${cwRep?`<span class="lab-date">CP · ${thDate(cwRep.date)}</span>`:''}</h3>`+(cw?`<div class="lab-tiles">`+[
    tile('ความเค็ม',fix(cw.salinity),'ppt'), tile('pH',fix(cw.ph)), tile('อัลคาไลน์',fix(cw.alk),'',cw.alk==null?null:c.alk(cw.alk)),
    tile('แอมโมเนีย',fix(cw.nh3,2),'',cw.nh3==null?null:c.nh3(cw.nh3)), tile('ไนไตรท์',fix(cw.no2,2),'',cw.no2==null?null:c.no2(cw.no2)),
    tile('แคลเซียม',fix(cw.ca)), tile('แมกนีเซียม',fix(cw.mg)), tile('โพแทสเซียม',fix(cw.k)),
    tile('สารอินทรีย์',fix(cw.om),'',cw.om==null?null:c.om(cw.om)), tile('ความขุ่นใส',fix(cw.ntu,2),'NTU',cw.ntu==null?null:c.ntu(cw.ntu)),
  ].join('')+`</div>`:'<p class="hint">ไม่มีผลคุณภาพน้ำของบ่อนี้</p>')+`</div>`);

  const vw=[], vl=[];
  if(cw) vw.push(['CP',cwRep.date,cw.yvc,cw.gvc,c.y,c.g]);
  const tcRep = latest('unify_tcbs'), tc = rowOf(tcRep,p);
  if(tc){ vw.push(['Unify',tcRep.date,tc.waterY,tc.waterG,C.unifyWater,C.unifyWater]); }
  const csRep = latest('cp_shrimp'), cs = rowOf(csRep,p);
  if(cs) vl.push(['CP',csRep.date,cs.yvc,cs.gvc,C.cpShrimp.y,C.cpShrimp.g]);
  if(tc) vl.push(['Unify',tcRep.date,tc.liverY,tc.liverG,C.unifyLiver,C.unifyLiver]);
  const plRep = latest('unity_plates'), pl = rowOf(plRep,p);
  const vib = (rows,unit,extra='') => (rows.length||extra) ? `<div class="lab-tw"><table class="lab-t"><thead><tr><th>บริษัท</th><th>วันที่</th><th>เหลือง</th><th>เขียว</th></tr></thead><tbody>`+
    rows.map(r=>`<tr><td>${r[0]}</td><td>${thDate(r[1])}</td>${cell(r[2],r[4],sci(r[2]),'lab-v')}${cell(r[3],r[5],sci(r[3]),'lab-v')}</tr>`).join('')+extra+
    `</tbody></table></div><p class="lab-crit">${unit} · ใช้เกณฑ์ของบริษัทที่ตรวจ</p>` : '<p class="hint">ยังไม่มีผล</p>';
  out.push(`<div class="lab-2col"><div class="card"><h3>เชื้อในน้ำ</h3>${vib(vw,'CFU/ml')}</div>
    <div class="card"><h3>เชื้อในตับ</h3>${vib(vl,'CFU/g', pl?`<tr><td>Unity</td><td>${thDate(plRep.date)}</td><td colspan="2" class="${pl.liver==='yellow'?'lab-bad':'lab-ok'}">${pl.liver==='yellow'?'มีโคโลนีเหลือง (รูปจาน)':'ไม่พบ (รูปจาน)'}</td></tr>`:'')}</div></div>`);

  const cols=[];
  ['unify_health','unify_pond'].forEach(t=>{ const rep=latest(t), r=rowOf(rep,p);
    if(r) cols.push({n:'Unify',d:rep.date,fat:r.fat,atm:r.atm,atrophy:r.atrophy,ehp:r.ehp,spore:r.spore,gut:r.gut,leg:r.leg,gill:r.gill,weight:r.weight,size:r.size,pdg:r.pdg,age:r.age}); });
  const unRep = latest('unity_health'), un = rowOf(unRep,p);
  if(un) cols.push({n:'Unity',d:unRep.date,fatTxt:un.fat,fat:parseInt(un.fat),atm:un.atm,liverTxt:un.liver,ehp:un.ehp,spore:un.spore,gutTxt:un.gut,gill:un.outside});
  cols.sort((a,b)=>a.d<b.d?1:-1);
  const h = C.health, chk = (v,f) => v==null||isNaN(v) ? null : f(v);
  const rowsDef = [
    ['% ไขมัน', x=>x.fatTxt||pct(x.fat), x=>chk(x.fat,h.fat)],
    ['ATM', x=>pct(x.atm), x=>chk(x.atm,h.atm)],
    ['ฝ่อ/คอด · พูตับ', x=>x.liverTxt||pct(x.atrophy), x=>x.liverTxt?!BAD_LIVER_TXT.test(x.liverTxt):chk(x.atrophy,h.atrophy)],
    ['ตัวอ่อน EHP', x=>pct(x.ehp), x=>chk(x.ehp,h.ehp)],
    ['สปอร์ EHP', x=>pct(x.spore), x=>chk(x.spore,h.spore)],
    ['ลำไส้อักเสบ', x=>x.gutTxt||pct(x.gut), x=>x.gutTxt?x.gutTxt!=='อักเสบ':chk(x.gut,h.gut)],
    ['ขาว่ายน้ำ', x=>x.leg||'–', ()=>null],
    ['เหงือก', x=>x.gill||'–', x=>x.gill?x.gill==='ปกติ':null],
  ];
  out.push(`<div class="card"><h3>สุขภาพตับ (กล้องจุลทรรศน์)</h3>`+(cols.length?`<div class="lab-tw"><table class="lab-t lab-t-fit"><thead><tr><th>ค่า</th>${cols.map(x=>`<th>${x.n}<small>${thDate(x.d)}</small></th>`).join('')}</tr></thead><tbody>`+
    rowsDef.map(([k,f,t])=>`<tr><td class="lab-left">${k}</td>${cols.map(x=>{const s=f(x), ok=t(x); return `<td class="${s==='–'?'lab-na':ok==null?'':ok?'lab-ok':'lab-bad'}">${esc(s)}</td>`;}).join('')}</tr>`).join('')+
    `</tbody></table></div>`:'<p class="hint">ยังไม่มีผล</p>')+`</div>`);

  const g = cols.filter(x=>x.weight!=null);
  const age = (cs||cw||{}).age, ageRep = cs?csRep:cwRep;
  out.push(`<div class="card"><h3>การเติบโต</h3><div class="lab-tiles">`+
    (age!=null?tile('อายุ',age,'วัน',null,'CP · '+thDate(ageRep.date)):'')+
    g.map(x=>tile('น้ำหนักเฉลี่ย',x.weight,'กรัม',null,x.n+' · '+thDate(x.d))+(x.size!=null?tile('ไซส์',x.size.toLocaleString(),'ตัว/กก.',null,x.n+' · '+thDate(x.d)):'')+(x.pdg!=null?tile('PDG',x.pdg,'ก./วัน',null,x.n+' · '+thDate(x.d)):'')).join('')+
    `</div>${!g.length&&age==null?'<p class="hint">ยังไม่มีผล</p>':''}</div>`);

  const adv = TYPE_ORDER.map(t=>{ const rep=latest(t); return rep ? adviceHtml(rep,p) : ''; }).join('') +
    (un && un.advice && un.advice!=='ปกติ' ? `<div class="lab-advice" style="border-color:${LAB_CO.unity.color}"><b>คำแนะนำ Unity · ${thDate(unRep.date)}</b>${esc(un.advice)}</div>` : '');
  if(adv) out.push(`<div class="card"><h3>คำแนะนำจากบริษัท</h3>${adv}</div>`);
  return out.join('');
}

/* ---------- บ่อที่ควรดู ---------- */
function watchList(){
  const why = {};
  const add = (p,t) => { (why[p] = why[p] || []).includes(t) || why[p].push(t); };
  const cw = latest('cp_water');
  if(cw) cw.rows.forEach(r=>{ const c=C.cpWater;
    if((r.yvc!=null&&!c.y(r.yvc))||(r.gvc!=null&&!c.g(r.gvc))) add(r.pond,'เชื้อในน้ำเกิน (CP)');
    if(r.om!=null&&!c.om(r.om)) add(r.pond,'สารอินทรีย์สูง '+r.om);
    if(r.ntu!=null&&!c.ntu(r.ntu)) add(r.pond,(r.ntu>10?'น้ำขุ่น ':'น้ำใสเกิน ')+r.ntu+' NTU');
    if(r.alk!=null&&!c.alk(r.alk)) add(r.pond,'อัลคาไลน์ต่ำ '+r.alk);
    if(r.nh3!=null&&!c.nh3(r.nh3)) add(r.pond,'แอมโมเนียสูง '+r.nh3);
  });
  const tc = latest('unify_tcbs');
  if(tc) tc.rows.forEach(r=>{ if(!C.unifyWater(r.waterY)||!C.unifyWater(r.waterG)) add(r.pond,'เชื้อในน้ำเกิน (Unify)'); if(!C.unifyLiver(r.liverY)||!C.unifyLiver(r.liverG)) add(r.pond,'เชื้อในตับเกิน (Unify)'); });
  const cs = latest('cp_shrimp');
  if(cs) cs.rows.forEach(r=>{ if(!C.cpShrimp.y(r.yvc)||!C.cpShrimp.g(r.gvc)) add(r.pond,'เชื้อในตับเกิน (CP)'); });
  const uh = latest('unify_health');
  if(uh) uh.rows.forEach(r=>{ if(r.atm!=null&&!C.health.atm(r.atm)) add(r.pond,'ATM '+r.atm+'%'); if(r.ehp!=null&&!C.health.ehp(r.ehp)) add(r.pond,'ตัวอ่อน EHP '+r.ehp+'%'); if(r.gut!=null&&!C.health.gut(r.gut)) add(r.pond,'ลำไส้อักเสบ '+r.gut+'%'); });
  const un = latest('unity_health');
  if(un) un.rows.forEach(r=>{ const w=[]; if(r.atm!=null&&!C.health.atm(r.atm)) w.push('ATM '+r.atm+'%'); if(r.ehp!=null&&!C.health.ehp(r.ehp)) w.push('EHP '+r.ehp+'%'); if(r.gut==='อักเสบ') w.push('ลำไส้อักเสบ'); if(w.length) add(r.pond,'Unity: '+w.join(' · ')); });
  const list = Object.entries(why).sort((a,b)=>b[1].length-a[1].length);
  if(!list.length) return '<p class="hint">ทุกบ่อผ่านเกณฑ์</p>';
  return `<div class="lab-watch">`+list.map(([p,w])=>`<button class="lab-w" onclick="labGotoPond('${esc(p)}')"><span class="lab-pn">${esc(p)}</span><ul>${w.slice(0,4).map(t=>`<li>${esc(t)}</li>`).join('')}${w.length>4?`<li>อีก ${w.length-4} รายการ</li>`:''}</ul></button>`).join('')+`</div>`;
}

/* ---------- render ---------- */
function render(){
  const wrap = $('labWrap'); if(!wrap || !DATA) return;
  const seg = `<div class="lab-seg"><button aria-pressed="${curView==='co'}" onclick="labSetView('co')">ดูตามบริษัท</button><button aria-pressed="${curView==='pond'}" onclick="labSetView('pond')">ดูตามบ่อ</button></div>`;
  wrap.innerHTML = seg + `<div class="lab-body">${curView==='co'?coView():pondView()}</div>` +
    `<div class="card"><h2><i class="ti ti-alert-triangle"></i> บ่อที่ควรดูตอนนี้</h2><p class="hint" style="margin:-6px 0 10px;">คำนวณจากผลล่าสุดของทุกบริษัท แตะบ่อเพื่อดูค่าทั้งหมด</p>${watchList()}</div>` +
    `<div class="lab-legend"><span><i class="lab-sw bad"></i>เกินเกณฑ์</span><span><i class="lab-sw ok"></i>อยู่ในเกณฑ์</span><span>ND = ไม่พบเชื้อ · – = ไม่ได้ตรวจ</span></div>`;
}

window.renderLabTab = function(){
  const wrap = $('labWrap'); if(!wrap) return;
  if(!DATA) wrap.innerHTML = '<div class="card"><p class="hint">กำลังโหลดผลแลป…</p></div>';
  load().then(render).catch(()=>{ wrap.innerHTML = '<div class="card"><p class="hint">โหลดผลแลปไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง</p></div>'; });
};
window.labSetView = v => { curView = v; render(); };
window.labSetCo = k => { curCo = k; render(); };
window.labSetPond = p => { curPond = p; render(); };
window.labSetDate = (t,d) => { sel[t] = d; render(); };
window.labGotoPond = p => {
  curPond = p; curView = 'pond'; render();
  const w = $('labWrap'); if(w && window.scrollBelowTopbar) scrollBelowTopbar(w);
};
})();
