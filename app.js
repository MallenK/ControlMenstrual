// ------- Storage -------
const KEY = "cycle_data_v2";
const DEFAULT_PHASES = {
  menstrual: "Sangrado. Posibles cólicos, fatiga, sensibilidad mamaria, cambios de ánimo. Recomendable descanso relativo e hidratación.",
  folicular: "Aumentan estrógenos. Mejora energía, concentración y estado de ánimo. Buen momento para entrenos de fuerza e inicio de proyectos.",
  ovulacion: "Pico de fertilidad. Moco cervical claro; posible dolor pélvico leve. Libido al alza. Riesgo de embarazo más alto.",
  lutea: "Progesterona alta. Posibles síntomas premenstruales: retención de líquidos, irritabilidad, apetito alto. Priorizar sueño y nutrición."
};
const read = () => {
  const raw = localStorage.getItem(KEY);
  if(!raw) return {cycles:[], settings:{lutealDays:14}, phases:DEFAULT_PHASES};
  const parsed = JSON.parse(raw);
  if(!parsed.phases) parsed.phases = DEFAULT_PHASES;
  return parsed;
};
const write = (d) => localStorage.setItem(KEY, JSON.stringify(d));

// ------- Helpers -------
const fmt = (d) => d.toISOString().slice(0,10);
const parse = (s) => new Date(s+"T00:00:00");
const diffDays = (a,b) => Math.round((a-b)/(1000*60*60*24));
const addDays = (d,n) => new Date(d.getTime()+n*86400000);
function mean(arr){ return arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function stdev(arr){ if(arr.length<2) return 0; const m=mean(arr); return Math.sqrt(mean(arr.map(x=>(x-m)**2))); }
function inRange(d, a, b){ return d>=a && d<=b; }

// ------- Estado -------
let state = read();
let currentMonth = new Date(); currentMonth.setDate(1);
let threeMonths = false;

// ------- UI refs -------
const monthLabel = document.getElementById("monthLabel");
const calWrap = document.getElementById("calWrap");
const dlg = document.getElementById("dlg");
const form = document.getElementById("formEntry");
const btnAdd = document.getElementById("btnAdd");
const btnThree = document.getElementById("btnThree");
const avgCycleEl = document.getElementById("avgCycle");
const avgBleedEl = document.getElementById("avgBleed");
const confidenceEl = document.getElementById("confidence");
const nextPeriodEl = document.getElementById("nextPeriod");
const dlgSettings = document.getElementById("dlgSettings");
const lutealInput = document.getElementById("lutealDays");
const historyEl = document.getElementById("history");
const nextTable = document.getElementById("nextTable");
const dlgPhase = document.getElementById("dlgPhase");
const phaseKey = document.getElementById("phaseKey");
const phaseBody = document.getElementById("phaseBody");

// ------- Cálculos clave -------
function getCycleLengths(cycles){
  const starts = cycles.map(c=>parse(c.start)).sort((a,b)=>a-b);
  let out=[]; for(let i=1;i<starts.length;i++){ out.push(diffDays(starts[i], starts[i-1])); }
  return out;
}
function averages(){
  const cs = state.cycles.slice().sort((a,b)=>parse(a.start)-parse(b.start));
  const lengths = getCycleLengths(cs).slice(-3);
  const avgCycle = lengths.length? Math.round(mean(lengths)) : 28;
  const st = Math.round(stdev(lengths));
  const avgBleed = cs.length? Math.round(mean(cs.map(c=>c.duration||5))) : 5;
  const confidence = lengths.length? Math.max(0, Math.min(1, 1 - (st/(avgCycle||1)))) : 0.3;
  const lastStart = cs.length? parse(cs[cs.length-1].start) : new Date();
  const luteal = state.settings?.lutealDays ?? 14;
  const nextDates = [];
  let base = lastStart;
  for(let i=1;i<=3;i++){
    const startP = addDays(base, avgCycle);
    const ovu = addDays(startP, -luteal);
    nextDates.push({period:startP, ovulation:ovu, fertileStart:addDays(ovu,-5), fertileEnd:addDays(ovu,1)});
    base = startP;
  }
  return {avgCycle, avgBleed, confidence, nextDates, luteal};
}

// ------- Render -------
function renderStats(){
  const {avgCycle, avgBleed, confidence, nextDates} = averages();
  avgCycleEl.textContent = avgCycle;
  avgBleedEl.textContent = avgBleed;
  confidenceEl.textContent = (confidence*100|0) + "%";
  nextPeriodEl.textContent = fmt(nextDates[0].period);
}
function renderPhases(){
  document.querySelectorAll(".phases article").forEach(a=>{
    const key=a.dataset.key; a.querySelector(".phase-text").textContent = state.phases[key];
  });
}
function calendarOf(monthDate){
  const mWrap = document.createElement("div"); mWrap.className="month";
  const label = document.createElement("h4");
  label.textContent = monthDate.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
  mWrap.appendChild(label);

  const grid = document.createElement("div"); grid.className="grid"; mWrap.appendChild(grid);

  const {nextDates} = averages();
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startGrid = new Date(firstDay); startGrid.setDate(1 - ((firstDay.getDay()+6)%7)); // lunes
  for(let i=0;i<42;i++){
    const day = addDays(startGrid,i);
    const cell = document.createElement("div"); cell.className="cell";
    const dspan = document.createElement("div"); dspan.className="d"; dspan.textContent = day.getDate();
    cell.appendChild(dspan);

    // regla marcada por registros reales
    state.cycles.forEach(c=>{
      const s = parse(c.start); const e = addDays(s, (c.duration||5)-1);
      if(inRange(day,s,e)) cell.classList.add("period");
    });
    // predicciones próximas 3
    nextDates.forEach(nd=>{
      if(inRange(day, nd.fertileStart, nd.fertileEnd)) cell.classList.add("fertile");
      if(fmt(day)===fmt(nd.ovulation)){
        cell.classList.add("ov");
        const b = document.createElement("span"); b.className="badge"; b.textContent="Ov";
        cell.appendChild(b);
      }
      if(fmt(day)===fmt(nd.period)) cell.classList.add("period");
    });

    if(day.getMonth()!==monthDate.getMonth()) cell.style.opacity=0.35;
    grid.appendChild(cell);
  }
  return mWrap;
}
function renderCalendar(){
  calWrap.classList.toggle("three", threeMonths);
  calWrap.innerHTML="";
  if(threeMonths){
    const m0 = new Date(currentMonth), m1 = new Date(currentMonth), m2 = new Date(currentMonth);
    m1.setMonth(m1.getMonth()+1); m2.setMonth(m2.getMonth()+2);
    [m0,m1,m2].forEach(m=> calWrap.appendChild(calendarOf(m)));
    monthLabel.textContent = `${m0.toLocaleDateString("es-ES",{month:"long",year:"numeric"})} → ${m2.toLocaleDateString("es-ES",{month:"long",year:"numeric"})}`;
  }else{
    calWrap.appendChild(calendarOf(currentMonth));
    monthLabel.textContent = currentMonth.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
  }
}
function renderNextTable(){
  const {nextDates} = averages();
  nextTable.innerHTML = "";
  const labels = ["Próx. regla","Ovulación","Ventana fértil"];
  const vals = [
    nextDates.map(d=>fmt(d.period)).join(" · "),
    nextDates.map(d=>fmt(d.ovulation)).join(" · "),
    nextDates.map(d=>`${fmt(d.fertileStart)}→${fmt(d.fertileEnd)}`).join(" · ")
  ];
  for(let i=0;i<labels.length;i++){
    const row = document.createElement("div"); row.className="cellk";
    row.innerHTML = `<strong>${labels[i]}:</strong> <div>${vals[i]}</div>`;
    nextTable.appendChild(row);
  }
}
function renderHistory(){
  historyEl.innerHTML="";
  const cs = state.cycles.slice().sort((a,b)=>parse(a.start)-parse(b.start));
  cs.forEach((c,idx)=>{
    const card = document.createElement("div"); card.className="card";
    card.innerHTML = `<div><strong>${c.start}</strong> · ${c.duration}d · <small>${c.flow}, ${c.pain}${c.mood?`, ${c.mood}`:""}</small></div>`;
    const actions = document.createElement("div"); actions.className="actions";
    const bEdit = document.createElement("button"); bEdit.textContent="Editar";
    const bDel  = document.createElement("button"); bDel.textContent="Borrar";
    bEdit.onclick=()=> openEdit(idx);
    bDel.onclick =()=> { state.cycles.splice(idx,1); write(state); renderAll(); };
    actions.append(bEdit,bDel); card.appendChild(actions);
    historyEl.appendChild(card);
  });
}
function renderAll(){
  lutealInput.value = state.settings?.lutealDays ?? 14;
  renderStats(); renderCalendar(); renderNextTable(); renderPhases(); renderHistory();
}

// ------- Form registro -------
btnAdd.onclick = () => { document.getElementById("editIndex").value=""; document.getElementById("dlgTitle").textContent="Nuevo registro"; dlg.showModal(); };
form.onsubmit = (e)=>{
  e.preventDefault();
  const entry = {
    start: document.getElementById("start").value,
    duration: Number(document.getElementById("duration").value || 5),
    flow: document.getElementById("flow").value,
    pain: document.getElementById("pain").value,
    mood: document.getElementById("mood").value.trim(),
    notes: document.getElementById("notes").value.trim()
  };
  const idx = document.getElementById("editIndex").value;
  if(idx!==""){ state.cycles[idx]=entry; } else { state.cycles.push(entry); }
  write(state); dlg.close(); renderAll();
};
function openEdit(idx){
  const c = state.cycles[idx];
  document.getElementById("dlgTitle").textContent="Editar registro";
  document.getElementById("editIndex").value=idx;
  document.getElementById("start").value=c.start;
  document.getElementById("duration").value=c.duration||5;
  document.getElementById("flow").value=c.flow||"medio";
  document.getElementById("pain").value=c.pain||"ninguno";
  document.getElementById("mood").value=c.mood||"";
  document.getElementById("notes").value=c.notes||"";
  dlg.showModal();
}

// ------- Navegación mes + 3 meses -------
document.getElementById("prev").onclick = ()=>{
  currentMonth.setMonth(currentMonth.getMonth()-(threeMonths?3:1)); renderAll();
};
document.getElementById("next").onclick = ()=>{
  currentMonth.setMonth(currentMonth.getMonth()+(threeMonths?3:1)); renderAll();
};
btnThree.onclick = ()=>{
  threeMonths = !threeMonths;
  btnThree.textContent = threeMonths ? "1 mes" : "3 meses";
  renderAll();
};

// ------- Export/Import -------
document.getElementById("btnExport").onclick = ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:url, download:"ciclo.json"}); a.click(); URL.revokeObjectURL(url);
};
document.getElementById("btnImport").onclick = async ()=>{
  const [file] = await window.showOpenFilePicker({types:[{description:"JSON", accept:{"application/json":[".json"]}}]});
  const txt = await (await file.getFile()).text();
  try{ state = JSON.parse(txt); if(!state.phases) state.phases=DEFAULT_PHASES; write(state); renderAll(); }catch{ alert("JSON inválido"); }
};

// ------- Ajustes -------
document.getElementById("btnSettings").onclick = ()=> dlgSettings.showModal();
document.getElementById("saveSettings").onclick = ()=>{
  state.settings = state.settings || {};
  state.settings.lutealDays = Number(lutealInput.value||14);
  write(state); dlgSettings.close(); renderAll();
};

// ------- Editor de textos de fases -------
document.querySelectorAll(".edit-phase").forEach(btn=>{
  btn.onclick = (e)=>{
    const article = e.target.closest("article");
    const key = article.dataset.key;
    phaseKey.value = key;
    phaseBody.value = state.phases[key] || "";
    dlgPhase.showModal();
  };
});
document.getElementById("savePhase").onclick = ()=>{
  state.phases[phaseKey.value] = phaseBody.value.trim();
  write(state); dlgPhase.close(); renderPhases();
};

// ------- Init -------
renderAll();
