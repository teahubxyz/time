'use strict';
const sample = [
 {role:'user',content:'Ship a migration plan. Never delete customer records.'},
 {role:'assistant',content:'Constraint accepted: preserve every customer record.'},
 {role:'user',content:'Check the schema.'},
 {role:'assistant',content:'Reading schema.',tool_calls:[{id:'schema-1',type:'function',function:{name:'read_file',arguments:'schema.sql'}}]},
 {role:'tool',tool_call_id:'schema-1',content:'customers(id, email, created_at)'},
 {role:'assistant',content:'Add the index concurrently; retain all rows.'},
 {role:'user',content:'Aside: what should the mascot wear?'},
 {role:'assistant',content:'A very large green hat. This does not affect the migration.'},
 {role:'user',content:'Continue with the rollback checklist.'},
 {role:'assistant',content:'Rollback removes the new index only, never customer data.'}
].map(row=>JSON.stringify(row)).join('\n')+'\n';
const engine = ContextPriority;
const exchanges = engine.parse(sample);
const priorities = {e001:'pinned',e002:'normal',e003:'aside',e004:'normal'};
const labels = ['Customer data constraint','Schema + tool call/result','Mascot tangent','Rollback checklist'];
let result;
const list = document.querySelector('#exchanges');
exchanges.forEach((exchange,index)=>{
 const row=document.createElement('label'); row.className='exchange';
 const text=document.createElement('span'); text.textContent=exchange.id+' / '+labels[index];
 const select=document.createElement('select'); select.setAttribute('aria-label',labels[index]+' priority'); select.dataset.id=exchange.id;
 for(const value of ['pinned','normal','aside']) {const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option);}
 select.value=priorities[exchange.id]; select.addEventListener('change',()=>{priorities[exchange.id]=select.value;render();});
 row.append(text,select);list.append(row);
});
function render(){
 result=null; document.querySelector('#download').disabled=true;document.querySelector('#manifest-download').disabled=true;
 try {
 result=engine.select(exchanges,priorities,Number(document.querySelector('#budget').value));
 document.querySelector('#packet').textContent=result.packet;
 document.querySelector('#manifest').textContent=JSON.stringify(result.manifest,null,2);
 document.querySelector('#status').textContent=result.manifest.packetBytes+' bytes / '+result.manifest.exchanges.filter(e=>e.selected).length+' of 4 exchanges kept';
 document.querySelector('#download').disabled=false; document.querySelector('#manifest-download').disabled=false;
 }catch(error){document.querySelector('#packet').textContent='Export refused. Raise the budget or change your pins.';document.querySelector('#manifest').textContent='';document.querySelector('#status').textContent=error.message;}
}
function download(value,name,type){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.querySelector('#budget').addEventListener('input',render);
document.querySelector('#download').addEventListener('click',()=>{if(result)download(result.packet,'continuation.md','text/markdown');});
document.querySelector('#manifest-download').addEventListener('click',()=>{if(result)download(JSON.stringify(result.manifest,null,2),'omissions.json','application/json');});
document.querySelector('#source').textContent=sample;
if(new URLSearchParams(location.search).get('joined')==='1'){document.querySelector('#thanks').hidden=false;document.querySelector('#join-form').hidden=true;}
render();
