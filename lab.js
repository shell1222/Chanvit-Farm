/* ============================================================
   LAB TAB — ผลแลปจาก Unify (จ.), CP (อ.), Unity (ศ.)
   ข้อมูลอยู่ใน Firestore คอลเลกชัน labReports (แยกจากข้อมูลฟาร์ม farms/chanvit)
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
  // ตามเกณฑ์ท้ายรายงานคุณภาพน้ำของ CP · r = แถวของบ่อ (ใช้อายุกุ้งและความเค็ม) · อายุ 0 = บ่อพักน้ำ
  cpWater:{
    ph:v=>v>=7.6&&v<=8.0, alk:v=>v>=120, nh3:v=>v<=1, no2:v=>v<=1,
    ca:(v,r)=>v>=byAge(r.salinity,[[10,100],[20,200],[Infinity,300]]),
    mg:(v,r)=>v>=byAge(r.salinity,[[10,100],[20,400],[Infinity,600]]),
    k:(v,r)=>v>=byAge(r.salinity,[[10,100],[20,200],[Infinity,300]]),
    // สารอินทรีย์/ความขุ่น: ใช้ตามสีที่ CP ระบายจริง (≤10) แม้ท้ายรายงานจะผ่อนตามอายุ (≤15 / ≤20 NTU เมื่ออายุ 31–60 วัน)
    // ถ้าจะใช้แบบตามอายุ เปลี่ยนเป็น byAge(r.age,[[30,10],[60,15],[Infinity,20]]) และ byAge(r.age,[[30,10],[60,20],[Infinity,30]])
    om:(v,r)=>v<=10,
    ntu:(v,r)=>r.age===0 ? v<1 : v<=10,
    y:v=>v<1000, g:v=>v<100, t:v=>v<1100},
  cpShrimp:{g:v=>v<100, y:v=>v<1000, t:v=>v<1100},
  unifyWater:v=>v<=1000, unifyLiver:v=>v<=100000,
  health:{fat:v=>v>=80, atm:v=>v<=10, ehp:v=>v<=10, spore:v=>v<=0, gut:v=>v<=10, atrophy:v=>v<=10},
};
// หาเกณฑ์ตามช่วง: [[สูงสุดของช่วง, ค่าเกณฑ์], ...]
function byAge(x, bands){ if(x==null) return bands[0][1]; for(const [max,val] of bands) if(x<=max) return val; return bands[bands.length-1][1]; }
// อายุกุ้งตามข้อมูลฟาร์ม (วันปล่อยในรอบเลี้ยงที่ครอบคลุมวันตรวจ) · null = วันนั้นไม่มีรอบเลี้ยงที่รู้วันปล่อย
function farmAge(pond, date){
  if(typeof getPondCycles !== 'function') return null;
  let best = null;
  getPondCycles(pond).forEach(c=>{
    if(!c.releaseDate || c.releaseDate > date) return;
    if(c.closeDate && c.closeDate < date) return;
    if(!best || c.releaseDate > best.releaseDate) best = c;
  });
  if(!best) return null;
  return Math.round((Date.parse(date+'T00:00:00Z') - Date.parse(best.releaseDate+'T00:00:00Z')) / 86400000);
}
// ช่องอายุ: แสดงอายุตามฟาร์ม ถ้าบริษัทเขียนต่างจากนี้ให้กำกับเลขของบริษัทไว้
function ageCell(r, rep){
  const ours = farmAge(r.pond, rep.date), theirs = r.age;
  if(ours == null) return `<td class="${theirs==null?'lab-na':''}">${theirs==null?'–':esc(theirs)}${theirs!=null?'<small class="lab-age-co">บริษัท</small>':''}</td>`;
  // ต่างกัน 1 วันไม่นับ (บางบริษัทนับวันปล่อยเป็นวันที่ 1)
  const diff = theirs != null && Math.abs(theirs - ours) > 1;
  return `<td>${ours}${diff?`<small class="lab-age-diff">บริษัท ${esc(theirs)}</small>`:''}</td>`;
}
const BAD_LIVER_TXT = /บวม|อักเสบ|30%/;

let DATA = null, loading = null, curView = 'co', curCo = 'cp', curPond = null, curMetric = 'wY', curPoint = null;
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
// อ่านจาก Firestore คอลเลกชัน labReports (แยกจาก farms/chanvit) และฟังการเปลี่ยนแปลงสด
// แสดงผลที่จำไว้ในเครื่องทันที แล้วค่อยอัปเดตเมื่อ Firestore ตอบ (เน็ตช้าจะไม่ค้างหน้า "กำลังโหลด")
const CACHE_KEY = 'labReportsCache';
let subscribed = false;
function readCache(){ try{ const c = JSON.parse(localStorage.getItem(CACHE_KEY)); return c && Array.isArray(c.reports) ? c : null; }catch(e){ return null; } }
function writeCache(d){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify(d)); }catch(e){} }
function subscribe(onFirst, onError){
  if(subscribed) return; subscribed = true;
  db.collection('labReports').onSnapshot(snap => {
    DATA = { reports: snap.docs.map(d => d.data()).filter(r => r && r.type && Array.isArray(r.rows)) };
    writeCache(DATA);
    onFirst && onFirst(DATA); onFirst = null;
    const tab = document.getElementById('tab-lab');
    if(tab && tab.style.display !== 'none') render();
  }, err => { console.error('labReports:', err); subscribed = false; onError && onError(err); });
}
function load(){
  if(DATA) return Promise.resolve(DATA);
  if(loading) return loading;
  const cached = readCache();
  loading = new Promise((resolve, reject) => {
    subscribe(resolve, err => { loading = null; if(!DATA) reject(err); });
    if(cached){ DATA = cached; resolve(DATA); }
  });
  return loading;
}

/* ---------- ตารางตามประเภทรายงาน ---------- */
const RENDER = {
  cp_water(rep){ const c=C.cpWater, T=(k,r)=>v=>c[k](v,r), rm=rep.rows.some(r=>r.remark);
    return `<div class="lab-tw"><table class="lab-t"><thead>
      <tr><th rowspan="2">บ่อ</th><th rowspan="2">อายุ<small>วัน (ฟาร์ม)</small></th><th class="lab-grp" colspan="9">คุณภาพน้ำ</th><th rowspan="2">ความขุ่นใส<small>NTU</small></th><th class="lab-grp" colspan="3">เชื้อในน้ำ <small>CFU/ml</small></th>${rm?'<th rowspan="2">หมายเหตุ</th>':''}</tr>
      <tr><th>ความเค็ม<small>ppt</small></th><th>pH</th><th>อัลคาไลน์</th><th>แอมโมเนีย</th><th>ไนไตรท์</th><th>แคลเซียม</th><th>แมกนีเซียม</th><th>โพแทสเซียม</th><th>สารอินทรีย์</th><th>เขียว GVC</th><th>เหลือง YVC</th><th>รวม TVC</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${ageCell(r,rep)}<td>${fix(r.salinity)}</td>${cell(r.ph,c.ph)}${cell(r.alk,c.alk)}${cell(r.nh3,c.nh3,fix(r.nh3,2))}${cell(r.no2,c.no2,fix(r.no2,2))}${cell(r.ca,T('ca',r))}${cell(r.mg,T('mg',r))}${cell(r.k,T('k',r))}${cell(r.om,T('om',r))}${cell(r.ntu,T('ntu',r),fix(r.ntu,2))}${cell(r.gvc,c.g,sci(r.gvc),'lab-v')}${cell(r.yvc,c.y,sci(r.yvc),'lab-v')}${cell(r.tvc,c.t,sci(r.tvc),'lab-v')}${rm?txtCell(r.remark):''}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ CP: pH 7.6–8.0 · อัลคาไลน์ ≥ 120 · แอมโมเนีย ≤ 1 · ไนไตรท์ ≤ 1 · Ca/Mg/K ตามความเค็ม (≤10: 100/100/100 · 11–20: 200/400/200 · &gt;20: 300/600/300) · สารอินทรีย์ ≤ 10 · ความขุ่น ≤ 10 NTU (บ่อพักน้ำ &lt; 1) · เชื้อเขียว &lt; 10<sup>2</sup> · เหลือง &lt; 10<sup>3</sup> · รวม &lt; 1.1×10<sup>3</sup></p>`;
  },
  cp_shrimp(rep){ const c=C.cpShrimp;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th>บ่อ</th><th>อายุ<small>วัน (ฟาร์ม)</small></th><th>เขียว GVC</th><th>เหลือง YVC</th><th>รวม TVC</th><th>น้ำหนักเฉลี่ย<small>กรัม/ตัว</small></th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${ageCell(r,rep)}${cell(r.gvc,c.g,sci(r.gvc),'lab-v')}${cell(r.yvc,c.y,sci(r.yvc),'lab-v')}${cell(r.tvc,c.t,sci(r.tvc),'lab-v')}${cell(r.weight)}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ CP: GVC &lt; 10<sup>2</sup> · YVC &lt; 10<sup>3</sup> · TVC &lt; 1.1×10<sup>3</sup> CFU/ml</p>`;
  },
  unify_health(rep){ const c=C.health;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th rowspan="2">บ่อ</th><th rowspan="2">อายุ<small>วัน (ฟาร์ม)</small></th><th rowspan="2">ไซส์<small>ตัว/กก.</small></th><th rowspan="2">นน.เฉลี่ย<small>กรัม</small></th><th rowspan="2">PDG<small>ก./วัน</small></th><th class="lab-grp" colspan="7">ตับ</th><th rowspan="2">ขาว่ายน้ำ</th><th rowspan="2">เหงือก</th></tr>
      <tr><th>% ไขมัน</th><th>ATM</th><th>ฝ่อ/คอด</th><th>รอยอักเสบ</th><th>ตัวอ่อน EHP</th><th>สปอร์ EHP</th><th>ลำไส้อักเสบ</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${ageCell(r,rep)}<td>${r.size!=null?r.size.toLocaleString():'–'}</td><td>${fix(r.weight,2)}</td>${cell(r.pdg,null,fix(r.pdg,2))}${cell(r.fat,c.fat,pct(r.fat))}${cell(r.atm,c.atm,pct(r.atm))}${cell(r.atrophy,c.atrophy,pct(r.atrophy))}${cell(r.lesion,null,pct(r.lesion))}${cell(r.ehp,c.ehp,pct(r.ehp))}${cell(r.spore,c.spore,pct(r.spore))}${cell(r.gut,c.gut,pct(r.gut))}${txtCell(r.leg)}${txtCell(r.gill, r.gill && r.gill!=='ปกติ')}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ตั้งต้น: ไขมัน ≥ 80% · ATM ≤ 10% · ฝ่อ/คอด ≤ 10% · ตัวอ่อน EHP ≤ 10% · ลำไส้อักเสบ ≤ 10%</p>`;
  },
  unify_tcbs(rep){
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th rowspan="2">บ่อ</th><th class="lab-grp" colspan="2">เชื้อในน้ำ <small>CFU/ml</small></th><th class="lab-grp" colspan="2">เชื้อในตับ <small>CFU/g</small></th></tr><tr><th>เหลือง</th><th>เขียว</th><th>เหลือง</th><th>เขียว</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${cell(r.waterY,C.unifyWater,sci(r.waterY),'lab-v')}${cell(r.waterG,C.unifyWater,sci(r.waterG),'lab-v')}${cell(r.liverY,C.unifyLiver,sci(r.liverY),'lab-v')}${cell(r.liverG,C.unifyLiver,sci(r.liverG),'lab-v')}</tr>`).join('')+
      `</tbody></table></div><p class="lab-crit">เกณฑ์ Unify: ในน้ำ ≤ 10<sup>3</sup> CFU/ml · ในตับ ≤ 10<sup>5</sup> CFU/g</p>`;
  },
  unify_pond(rep){ const c=C.health;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th>บ่อ</th><th>อายุ<small>วัน (ฟาร์ม)</small></th><th>นน.เฉลี่ย</th><th>ไซส์</th><th>% ไขมัน</th><th>ATM</th><th>ฝ่อ/คอด</th><th>ไขมันเป็นก้อน</th><th>รอยอักเสบ</th><th>ตัวอ่อน EHP</th><th>สปอร์ EHP</th><th>ลำไส้อักเสบ</th><th>เหงือก</th><th>ขาว่ายน้ำ</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${ageCell(r,rep)}<td>${fix(r.weight,2)}</td><td>${fix(r.size)}</td>${cell(r.fat,c.fat,pct(r.fat))}${cell(r.atm,c.atm,pct(r.atm))}${cell(r.atrophy,c.atrophy,pct(r.atrophy))}${cell(r.fatLump,null,pct(r.fatLump))}${cell(r.lesion,null,pct(r.lesion))}${cell(r.ehp,c.ehp,pct(r.ehp))}${cell(r.spore,c.spore,pct(r.spore))}${cell(r.gut,c.gut,pct(r.gut))}${txtCell(r.gill, r.gill && r.gill!=='ปกติ')}${txtCell(r.leg)}</tr>`).join('')+
      `</tbody></table></div>`;
  },
  unity_health(rep){ const c=C.health;
    return `<div class="lab-tw"><table class="lab-t"><thead><tr><th>บ่อ</th><th>ระดับไขมัน</th><th>พูตับ / ผนังตับ</th><th>ATM</th><th>เมลานิน</th><th>ตัวอ่อน EHP</th><th>สปอร์ EHP</th><th>ลำไส้</th><th>เหงือก / ภายนอก</th><th>คำแนะนำ</th></tr></thead><tbody>`+
      rep.rows.map(r=>`<tr><td>${esc(r.pond)}</td>${txtCell(r.fat, parseInt(r.fat)<80)}<td class="lab-wrap ${BAD_LIVER_TXT.test(r.liver||'')?'lab-bad':''}">${esc(r.liver||'–')}</td>${cell(r.atm,c.atm,pct(r.atm))}${cell(r.melanin,null,pct(r.melanin))}${cell(r.ehp,c.ehp,pct(r.ehp))}${cell(r.spore,c.spore,pct(r.spore))}${txtCell(r.gut, /อักเสบ/.test(r.gut||''))}${txtCell(r.outside, !!r.outside)}<td class="lab-wrap">${esc(r.advice||'–')}</td></tr>`).join('')+
      `</tbody></table></div>`;
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
    return `<div class="lab-rep"><h3>${TYPE_LABEL[t]} ${dateSel}</h3>${RENDER[t](rep)}${rep.note?`<p class="lab-note">${esc(rep.note)}</p>`:''}${adviceHtml(rep)}</div>`;
  }).join('') || '<p class="hint">ยังไม่มีผลของบริษัทนี้</p>';
  const c = LAB_CO[curCo];
  return `<div class="lab-chips">${chips}</div>
    <div class="card"><div class="lab-co-head"><b><i class="lab-dot" style="background:${c.color}"></i>${c.n}</b><span class="hint">ตรวจทุกวัน${c.day}</span></div>${blocks}</div>`;
}

/* ---------- กราฟแนวโน้มรายบ่อ ---------- */
const pctNum = v => v==null ? null : (typeof v==='number' ? v : (parseInt(v) || null));
const METRICS = [
  {k:'wY', n:'เชื้อเหลืองในน้ำ', u:'CFU/ml', log:true, src:[['cp','cp_water',r=>r.yvc],['unify','unify_tcbs',r=>r.waterY]], thr:[[1000,'เกณฑ์ 10³']]},
  {k:'wG', n:'เชื้อเขียวในน้ำ', u:'CFU/ml', log:true, src:[['cp','cp_water',r=>r.gvc],['unify','unify_tcbs',r=>r.waterG]], thr:[[100,'CP 10²'],[1000,'Unify 10³']]},
  {k:'lY', n:'เชื้อเหลืองในตับ', u:'CFU', log:true, src:[['cp','cp_shrimp',r=>r.yvc],['unify','unify_tcbs',r=>r.liverY]], thr:[[1000,'CP 10³'],[100000,'Unify 10⁵']]},
  {k:'lG', n:'เชื้อเขียวในตับ', u:'CFU', log:true, src:[['cp','cp_shrimp',r=>r.gvc],['unify','unify_tcbs',r=>r.liverG]], thr:[[100,'CP 10²'],[100000,'Unify 10⁵']]},
  {k:'om', n:'สารอินทรีย์', u:'ppm', src:[['cp','cp_water',r=>r.om]], thr:[[10,'เกณฑ์ 10']]},
  {k:'ntu', n:'ความขุ่นใส', u:'NTU', src:[['cp','cp_water',r=>r.ntu]], thr:[[10,'เกณฑ์ 10']]},
  {k:'alk', n:'อัลคาไลน์', u:'ppm', src:[['cp','cp_water',r=>r.alk]], thr:[[120,'ขั้นต่ำ 120']]},
  {k:'nh3', n:'แอมโมเนีย', u:'ppm', src:[['cp','cp_water',r=>r.nh3]], thr:[[1,'เกณฑ์ 1']]},
  {k:'atm', n:'ATM', u:'%', src:[['unify','unify_health',r=>r.atm],['unify','unify_pond',r=>r.atm],['unity','unity_health',r=>r.atm]], thr:[[10,'เกณฑ์ 10%']]},
  {k:'ehp', n:'ตัวอ่อน EHP', u:'%', src:[['unify','unify_health',r=>r.ehp],['unify','unify_pond',r=>r.ehp],['unity','unity_health',r=>r.ehp]], thr:[[10,'เกณฑ์ 10%']]},
  {k:'fat', n:'% ไขมัน', u:'%', src:[['unify','unify_health',r=>r.fat],['unify','unify_pond',r=>r.fat],['unity','unity_health',r=>pctNum(r.fat)]], thr:[[80,'ขั้นต่ำ 80%']]},
  {k:'wt', n:'น้ำหนักเฉลี่ย', u:'กรัม', src:[['unify','unify_health',r=>r.weight],['unify','unify_pond',r=>r.weight],['cp','cp_shrimp',r=>r.weight]], thr:[]},
];
function seriesOf(m, p){
  const by = {};
  m.src.forEach(([co,type,f])=>reportsOf(type).forEach(rep=>{ const row=rowOf(rep,p); if(!row) return; const v=f(row); if(v==null||isNaN(v)) return;
    (by[co]=by[co]||[]).push({d:rep.date, v:Number(v)}); }));
  Object.values(by).forEach(a=>a.sort((x,y)=>x.d<y.d?-1:1));
  return by;
}
function trendCard(p){
  const avail = METRICS.filter(m=>Object.values(seriesOf(m,p)).some(a=>a.length));
  if(!avail.length) return '';
  if(!avail.some(m=>m.k===curMetric)) curMetric = avail[0].k;
  const m = METRICS.find(x=>x.k===curMetric), by = seriesOf(m,p);
  const pts = Object.values(by).flat();
  const days = iso => Date.parse(iso+'T00:00:00Z')/86400000;
  const d0 = Math.min(...pts.map(x=>days(x.d))), d1 = Math.max(...pts.map(x=>days(x.d)));
  const W=420, H=230, L=46, R=14, T=14, B=34;
  const X = d => d1===d0 ? (L+W-R)/2 : L + (days(d)-d0)/(d1-d0)*(W-L-R);
  let yTicks, Y;
  if(m.log){
    const top = Math.max(3, ...pts.map(x=>x.v>0?Math.ceil(Math.log10(x.v)):0), ...m.thr.map(t=>Math.ceil(Math.log10(t[0]))));
    Y = v => T + (H-T-B) * (1 - (v>0?Math.log10(v):0)/top);
    yTicks = Array.from({length:top+1},(_,e)=>[e===0?0:10**e, e===0?'ND':`10<tspan dy="-5" font-size="9">${e}</tspan>`]);
  } else {
    const vals = pts.map(x=>x.v).concat(m.thr.map(t=>t[0]));
    let lo = Math.min(0,...vals), hi = Math.max(...vals)*1.15 || 1;
    const step = niceStep((hi-lo)/4); hi = Math.ceil(hi/step)*step;
    Y = v => T + (H-T-B) * (1 - (v-lo)/(hi-lo));
    yTicks = []; for(let v=lo; v<=hi+1e-9; v+=step) yTicks.push([v, String(+v.toFixed(2))]);
  }
  let g = '';
  yTicks.forEach(([v,l])=>{ const y=Y(v).toFixed(1); g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#e2e5e1"/><text x="${L-6}" y="${+y+4}" text-anchor="end" font-size="11" fill="#5f6b65">${l}</text>`; });
  m.thr.forEach(([v,l])=>{ const y=Y(v).toFixed(1); g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#a32d2d" stroke-width="1.2" stroke-dasharray="5 4"/><text x="${L+4}" y="${+y-4}" text-anchor="start" font-size="10.5" fill="#a32d2d" paint-order="stroke" stroke="#fff" stroke-width="3">${l}</text>`; });
  const dates = [...new Set(pts.map(x=>x.d))].sort(), every = Math.ceil(dates.length/6);
  dates.forEach((d,i)=>{ if(i%every && i!==dates.length-1) return; const [y,mo,da]=d.split('-'); g+=`<text x="${X(d).toFixed(1)}" y="${H-12}" text-anchor="middle" font-size="11" fill="#5f6b65">${+da}/${+mo}</text>`; });
  Object.entries(by).forEach(([co,a])=>{ const col=LAB_CO[co].color;
    if(a.length>1) g+=`<polyline points="${a.map(x=>X(x.d).toFixed(1)+','+Y(x.v).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    a.forEach((x,i)=>{ const on = curPoint && curPoint.co===co && curPoint.d===x.d;
      g+=`<g class="lab-pt" onclick="labPoint('${co}','${x.d}')"><circle cx="${X(x.d).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="16" fill="transparent"/><circle cx="${X(x.d).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="${on?6:i===a.length-1?4.5:3.2}" fill="${col}" stroke="#fff" stroke-width="1.5"/></g>`; });
  });
  // ป้ายตัวเลขของจุดที่แตะ
  const sel = curPoint && by[curPoint.co] && by[curPoint.co].find(x=>x.d===curPoint.d);
  if(sel){
    const [, mo, da] = sel.d.split('-');
    const label = `${LAB_CO[curPoint.co].n} ${+da}/${+mo}: ${m.log ? sciPlain(sel.v) : sel.v} ${m.u}`;
    const w = label.length*6.4 + 16, h = 24, px = X(sel.d), py = Y(sel.v);
    const bx = Math.min(Math.max(px - w/2, L), W - R - w), by_ = py - h - 10 < T ? py + 10 : py - h - 10;
    g += `<g pointer-events="none"><rect x="${bx.toFixed(1)}" y="${by_.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="6" fill="#1f2622" opacity="0.92"/><text x="${(bx+w/2).toFixed(1)}" y="${(by_+16).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">${esc(label)}</text></g>`;
  }
  const chips = avail.map(x=>`<button class="lab-chip lab-chip-sm" aria-pressed="${x.k===m.k}" onclick="labSetMetric('${x.k}')">${x.n}</button>`).join('');
  const legend = Object.keys(by).map(co=>`<span><i class="lab-sw" style="background:${LAB_CO[co].color}"></i>${LAB_CO[co].n}</span>`).join('');
  return `<div class="card"><h3>แนวโน้มบ่อ ${esc(p)}</h3><div class="lab-chips">${chips}</div>
    <svg class="lab-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟ${m.n} บ่อ ${esc(p)}">${g}</svg>
    <div class="lab-legend">${legend}<span>${m.u}${m.log?' · แกนตั้งเป็นเลขยกกำลัง 10':''} · แตะจุดเพื่อดูตัวเลข</span></div></div>`;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function sciPlain(v){ if(v===0) return 'ND'; const e=Math.floor(Math.log10(v)); if(e<1) return String(v); const m=+(v/10**e).toFixed(2); return (m===1?'':m+'×')+'10'+String(e).split('').map(d=>SUP[d]).join(''); }
function niceStep(x){ const e=10**Math.floor(Math.log10(x||1)), f=x/e; return (f<=1?1:f<=2?2:f<=5?5:10)*e; }

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
  out.push(trendCard(p));

  const cwRep = latest('cp_water'), cw = rowOf(cwRep,p), c = C.cpWater;
  out.push(`<div class="card"><h3>คุณภาพน้ำ ${cwRep?`<span class="lab-date">CP · ${thDate(cwRep.date)}</span>`:''}</h3>`+(cw?`<div class="lab-tiles">`+[
    tile('ความเค็ม',fix(cw.salinity),'ppt'), tile('pH',fix(cw.ph),'',cw.ph==null?null:c.ph(cw.ph)), tile('อัลคาไลน์',fix(cw.alk),'',cw.alk==null?null:c.alk(cw.alk)),
    tile('แอมโมเนีย',fix(cw.nh3,2),'',cw.nh3==null?null:c.nh3(cw.nh3)), tile('ไนไตรท์',fix(cw.no2,2),'',cw.no2==null?null:c.no2(cw.no2)),
    tile('แคลเซียม',fix(cw.ca),'',cw.ca==null?null:c.ca(cw.ca,cw)), tile('แมกนีเซียม',fix(cw.mg),'',cw.mg==null?null:c.mg(cw.mg,cw)), tile('โพแทสเซียม',fix(cw.k),'',cw.k==null?null:c.k(cw.k,cw)),
    tile('สารอินทรีย์',fix(cw.om),'',cw.om==null?null:c.om(cw.om,cw)), tile('ความขุ่นใส',fix(cw.ntu,2),'NTU',cw.ntu==null?null:c.ntu(cw.ntu,cw)),
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
  cols.sort((a,b)=>a.d<b.d?-1:1); // เก่า → ใหม่ ซ้ายไปขวา เหมือนกราฟ
  const h = C.health, chk = (v,f) => v==null||isNaN(v) ? null : f(v);
  const rowsDef = [
    ['% ไขมัน', x=>x.fatTxt||pct(x.fat), x=>chk(x.fat,h.fat)],
    ['ATM', x=>pct(x.atm), x=>chk(x.atm,h.atm)],
    ['ฝ่อ/คอด · พูตับ', x=>x.liverTxt||pct(x.atrophy), x=>x.liverTxt?!BAD_LIVER_TXT.test(x.liverTxt):chk(x.atrophy,h.atrophy)],
    ['ตัวอ่อน EHP', x=>pct(x.ehp), x=>chk(x.ehp,h.ehp)],
    ['สปอร์ EHP', x=>pct(x.spore), x=>chk(x.spore,h.spore)],
    ['ลำไส้อักเสบ', x=>x.gutTxt||pct(x.gut), x=>x.gutTxt?!/อักเสบ/.test(x.gutTxt):chk(x.gut,h.gut)],
    ['ขาว่ายน้ำ', x=>x.leg||'–', ()=>null],
    ['เหงือก', x=>x.gill||'–', x=>x.gill?x.gill==='ปกติ':null],
  ];
  out.push(`<div class="card"><h3>สุขภาพตับ (กล้องจุลทรรศน์)</h3>`+(cols.length?`<div class="lab-tw"><table class="lab-t lab-t-fit"><thead><tr><th>ค่า</th>${cols.map(x=>`<th>${x.n}<small>${thDate(x.d)}</small></th>`).join('')}</tr></thead><tbody>`+
    rowsDef.map(([k,f,t])=>`<tr><td class="lab-left">${k}</td>${cols.map(x=>{const s=f(x), ok=t(x); return `<td class="${s==='–'?'lab-na':ok==null?'':ok?'lab-ok':'lab-bad'}">${esc(s)}</td>`;}).join('')}</tr>`).join('')+
    `</tbody></table></div>`:'<p class="hint">ยังไม่มีผล</p>')+`</div>`);

  const g = cols.filter(x=>x.weight!=null);
  const today = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const age = farmAge(p, today);
  out.push(`<div class="card"><h3>การเติบโต <span class="lab-date">น้ำหนัก/ไซส์จากบริษัท ใช้ดูประกอบ</span></h3><div class="lab-tiles">`+
    (age!=null?tile('อายุวันนี้',age,'วัน',null,'ตามวันปล่อยในข้อมูลฟาร์ม'):'')+
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
    if(r.om!=null&&!c.om(r.om,r)) add(r.pond,'สารอินทรีย์สูง '+r.om);
    if(r.ntu!=null&&!c.ntu(r.ntu,r)) add(r.pond,'น้ำขุ่น '+r.ntu+' NTU'+(r.age===0?' (บ่อพักควร < 1)':''));
    if(r.ph!=null&&!c.ph(r.ph)) add(r.pond,'pH '+r.ph);
    if(r.no2!=null&&!c.no2(r.no2)) add(r.pond,'ไนไตรท์สูง '+r.no2);
    ['ca','mg','k'].forEach(k=>{ if(r[k]!=null&&!c[k](r[k],r)) add(r.pond,({ca:'แคลเซียม',mg:'แมกนีเซียม',k:'โพแทสเซียม'})[k]+'ต่ำ '+r[k]); });
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
  if(un) un.rows.forEach(r=>{ const w=[]; if(r.atm!=null&&!C.health.atm(r.atm)) w.push('ATM '+r.atm+'%'); if(r.ehp!=null&&!C.health.ehp(r.ehp)) w.push('EHP '+r.ehp+'%'); if(/อักเสบ/.test(r.gut||'')) w.push('ลำไส้'+(r.gut==='อักเสบ'?'อักเสบ':r.gut)); if(w.length) add(r.pond,'Unity: '+w.join(' · ')); });
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
  if(!DATA){
    wrap.innerHTML = '<div class="card"><p class="hint">กำลังโหลดผลแลป…</p></div>';
    setTimeout(()=>{ if(!DATA && $('labWrap')) $('labWrap').innerHTML = '<div class="card"><p class="hint">สัญญาณช้า ยังโหลดผลแลปไม่เสร็จ รอสักครู่ หรือปิดแอปแล้วเปิดใหม่</p></div>'; }, 8000);
  }
  load().then(render).catch(()=>{ wrap.innerHTML = '<div class="card"><p class="hint">โหลดผลแลปไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง</p></div>'; });
};
window.labSetView = v => { curView = v; render(); };
window.labSetCo = k => { curCo = k; render(); };
window.labSetPond = p => { curPond = p; curPoint = null; render(); };
window.labSetMetric = k => { curMetric = k; curPoint = null; render(); };
window.labPoint = (co,d) => { curPoint = (curPoint && curPoint.co===co && curPoint.d===d) ? null : {co,d}; render(); };
window.labSetDate = (t,d) => { sel[t] = d; render(); };
window.labGotoPond = p => {
  curPond = p; curView = 'pond'; render();
  const w = $('labWrap'); if(w && window.scrollBelowTopbar) scrollBelowTopbar(w);
};
})();
