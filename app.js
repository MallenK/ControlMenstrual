// ------- Storage -------
const KEY = "cycle_data_v1";
const read = () => JSON.parse(localStorage.getItem(KEY) || '{"cycles":[],"settings":{"lutealDays":14}}');
const write = (d) => localStorage.setItem(KEY, JSON.stringify(d));

// ------- Helpers -------
const fmt = (d) => d.toISOString().slice(0,10);
const parse = (s) => new Date(s+"T00:00:00");
const diffDays = (a,b) => Math.round((a-b)/(1000*60*60*24));
const addDays = (d,n) => new Date(d.getTime()+n*86400000);

// Media y desviación
function mean(arr){ return arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function stdev(arr){ if(arr.length<2) return 0; const m=mean(arr); return Math.sqrt(mean(arr.map(x=>(x-m)**2))); }

// ------- Estado -------
let state = read();
let currentMonth = new Date(); currentMonth.setDate(1);

// ------- UI refs -------
const monthLabel = document.getElementById("monthLabel");
const cal = document.getElementById("calendar");
const dlg = document.getElementById("dlg");
const form = document.getElementById("formEntry");
const btnAdd = document.getElementById("btnAdd");
const avgCycleEl = document.getElementById("avgCycle");
const avgBleedEl = document.getElementById("avgBleed");
const confidenceEl = document.getElementById("confidence");
const nextPeriodEl = document.getElementById("nextPeriod");
const dlgSettings = document.getElementById("dlgSettings");
const lutealInput = document.getElementById("lutealDays");

// ------- Cálculos clave -------
function getCycleLengths(cycles){
  const starts = cycles.map(c=>parse(c.start)).sort((a,b)=>a-b);
  let out=[];
  for(let i=1;i<starts.length;i++){ out.push(diffDays(starts[i], starts[i-1])); }
  return out;
}

function averages(){
  const cs = state.cycles.slice().sort((a,b)=>parse(a.start)-parse(b.start));
  const lengths = getCycleLengths(cs).slice(-3); // últimos 3
  const avgCycle = lengths.length? Math.round(mean(lengths)) : 28;
  const st = Math.round(stdev(lengths));
  const avgBleed = cs.length? Math.round(mean(cs.map(c=>c.duration||5))) : 5;
  const confidence = lengths.length? Math.max(0, Math.min(1, 1 - (st/(avgCycle||1)))) : 0.3;
  const lastStart = cs.length? parse(cs[cs.length-1].start) : new Date();
  const nextPeriodStart = addDays(lastStart, avgCycle);
  const luteal = state.settings?.lutealDays ?? 14;
  const ovulation = addDays(nextPeriodStart, -luteal);
  const fertileStart = addDays(ovulation, -5), fertileEnd = addDays(ovulation, 1);
  return {avgCycle, avgBleed, confidence, nextPeriodStart, ovulation, fertileStart, fertileEnd};
}

// ------- Render -------
function renderStats(){
  const {avgCycle, avgBleed, confidence, nextPeriodStart} = averages();
  avgCycleEl.textContent = avgCycle;
  avgBleedEl.textContent = avgBleed;
  confidenceEl.textContent = (confidence*100|0) + "%";
  nextPeriodEl.textContent = fmt(nextPeriodStart);
}

function inRange(d, a, b){ return d>=a && d<=b; }

function renderCalendar(){
  const {ovulation, fertileStart, fertileEnd} = averages();
  const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
  monthLabel.textContent = currentMonth.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
  cal.innerHTML = "";

  const firstDay = new Date(y,m,1);
  const startGrid = new Date(firstDay); startGrid.setDate(1 - ((firstDay.getDay()+6)%7)); // lunes
  for(let i=0;i<42;i++){
    const day = addDays(startGrid,i);
    const cell = document.createElement("div"); cell.className="cell";
    const dspan = document.createElement("div"); dspan.className="d"; dspan.textContent = day.getDate();
    cell.appendChild(dspan);

    // marcas
    // regla: cualquier día entre start y start+duration-1
    state.cycles.forEach(c=>{
      const s = parse(c.start); const e = addDays(s, (c.duration||5)-1);
      if(inRange(day,s,e)) cell.classList.add("period");
    });

    // fértil y ovulación
    if(inRange(day, fertileStart, fertileEnd)) cell.classList.add("fertile");
    if(fmt(day)===fmt(ovulation)){
      cell.classList.add("ov");
      const b = document.createElement("span"); b.className="badge"; b.textContent="Ov";
      cell.appendChild(b);
    }

    // atenuar fuera de mes
    if(day.getMonth()!==m) cell.style.opacity=0.35;

    cal.appendChild(cell);
  }
}

function renderAll(){
  lutealInput.value = state.settings?.lutealDays ?? 14;
  renderStats();
  renderCalendar();
}

// ------- Eventos -------
btnAdd.onclick = () => {
  // sugerir duración por media
  document.getElementById("duration").value = averages().avgBleed || 5;
  dlg.showModal();
};
form.onsubmit = (e)=>{
  e.preventDefault();
  const start = document.getElementById("start").value;
  if(!start) return;
  const entry = {
    start,
    duration: Number(document.getElementById("duration").value || 5),
    flow: document.getElementById("flow").value,
    pain: document.getElementById("pain").value,
    mood: document.getElementById("mood").value.trim(),
    notes: document.getElementById("notes").value.trim()
  };
  state.cycles.push(entry);
  write(state);
  dlg.close();
  renderAll();
};

// navegación mes
document.getElementById("prev").onclick = ()=>{ currentMonth.setMonth(currentMonth.getMonth()-1); renderAll(); };
document.getElementById("next").onclick = ()=>{ currentMonth.setMonth(currentMonth.getMonth()+1); renderAll(); };

// export/import
document.getElementById("btnExport").onclick = ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:url, download:"ciclo.json"});
  a.click(); URL.revokeObjectURL(url);
};
document.getElementById("btnImport").onclick = async ()=>{
  const [file] = await window.showOpenFilePicker({types:[{description:"JSON", accept:{"application/json":[".json"]}}]});
  const txt = await (await file.getFile()).text();
  try{ state = JSON.parse(txt); write(state); renderAll(); }catch{ alert("JSON inválido"); }
};

// ajustes
document.getElementById("btnSettings").onclick = ()=> dlgSettings.showModal();
document.getElementById("saveSettings").onclick = ()=>{
  state.settings = state.settings || {};
  state.settings.lutealDays = Number(lutealInput.value||14);
  write(state);
  dlgSettings.close();
  renderAll();
};

// init
renderAll();
