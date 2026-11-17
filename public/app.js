const $ = (id) => document.getElementById(id);
const moneyDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
async function api(path, options={}) { const response=await fetch(path,{headers:{'content-type':'application/json',...(options.headers||{})},...options}); const data=await response.json(); if(!response.ok) throw new Error(data.error||'Request failed'); return data; }
let applications=[];
async function load() {
  const q=$('search').value.trim(), status=$('status').value;
  const query=new URLSearchParams(); if(q) query.set('q',q); if(status) query.set('status',status);
  const [list,stats]=await Promise.all([api(`/api/applications?${query}`),api('/api/summary')]);
  applications=list.items;
  $('total').textContent=stats.total; $('interviews').textContent=stats.counts.interview; $('offers').textContent=stats.counts.offer; $('applied').textContent=stats.counts.applied;
  $('rows').innerHTML=applications.map(app=>`<tr><td><strong>${escapeHtml(app.company)}</strong><small>${escapeHtml(app.role)}</small></td><td>${escapeHtml(app.location||'—')}</td><td>${moneyDate(app.appliedAt)}</td><td><span class="stage ${app.status}">${app.status}</span></td><td><button class="action" data-id="${app.id}">View next step</button></td></tr>`).join('');
  $('empty').hidden=applications.length>0; $('count').textContent=`Showing ${applications.length} of ${list.total} applications · page ${list.page} of ${Math.max(1,list.pages)}`;
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('newBtn').onclick=()=>$('formDialog').showModal(); $('closeDialog').onclick=()=>$('formDialog').close();
$('search').oninput=()=>load().catch(showError); $('status').onchange=()=>load().catch(showError);
$('rows').addEventListener('click',async e=>{const btn=e.target.closest('button[data-id]');if(!btn)return;const app=applications.find(a=>a.id===btn.dataset.id);const activity=await api(`/api/applications/${app.id}/activity`);const next={saved:'applied',applied:'screening',screening:'interview',interview:'offer',offer:'accepted'}[app.status];if(next&&confirm(`${app.company}: move from ${app.status} to ${next}?`)){await api(`/api/applications/${app.id}/transition`,{method:'POST',body:JSON.stringify({status:next,details:'Moved from dashboard'})});await load();}else if(!next){alert(`${app.company}\nStage: ${app.status}\nActivity events: ${activity.items.length}\nVersion: ${app.version}`);}});
$('appForm').onsubmit=async e=>{e.preventDefault();$('formError').textContent='';const data=Object.fromEntries(new FormData(e.currentTarget));try{await api('/api/applications',{method:'POST',body:JSON.stringify(data)});e.currentTarget.reset();$('formDialog').close();await load();}catch(error){$('formError').textContent=error.message;}};
function showError(error){console.error(error);$('count').textContent=error.message;}
load().catch(showError);
