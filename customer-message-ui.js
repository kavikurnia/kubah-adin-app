import {$,esc,table,form,select,area,bindForm,message,date} from './planning-ui.js?v=kebijakan-20260913-r9';
import {customerMessages,PROGRAMS,MESSAGE_STATUS,messageNumber} from './customer-message-service.js?v=katalog-pembeli-20260909-r7';
export async function renderCustomerMessages(U){
  const rows=await U.store.list('customerMessages');if(!U.isCurrent())return;
  rows.sort((a,b)=>Number(b.createdAt?.toMillis?.()||Date.parse(b.createdAt)||0)-Number(a.createdAt?.toMillis?.()||Date.parse(a.createdAt)||0));
  const title=p=>p==='contact'?'Hubungi Kami':PROGRAMS.find(([k])=>k===p)?.[1]||p;
  $('#content').innerHTML='<h1>Pesan & Kerja Sama</h1><p>Pesan pelanggan dan pengajuan kebutuhan umum. Penawaran pemasok tetap di Supplier → Pengajuan Kerja Sama.</p><button id="messages-refresh">Muat ulang</button>'+table(['Nomor / tanggal','Program','Nama / kontak','Status','Tindakan'],rows.map(r=>[esc(messageNumber(r.id))+'<br>'+date(r.createdAt),esc(title(r.payload.program)),esc(r.payload.name)+'<br>'+esc(r.payload.phone),esc(MESSAGE_STATUS[r.status]),`<button data-message="${esc(r.id)}">Tinjau</button>`]))+'<section id="message-detail"></section>';
  $('#messages-refresh').onclick=()=>U.render();document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{
    const r=rows.find(x=>x.id===b.dataset.message),p=r.payload;
    $('#message-detail').innerHTML='<h2>'+esc(messageNumber(r.id))+'</h2>'+table(['Rincian','Isi'],Object.entries({Program:title(p.program),Nama:p.name,'Usaha / lembaga':p.business,WhatsApp:p.phone,Email:p.email,Kota:p.city,Topik:p.topic,Kebutuhan:p.needs,Jumlah:p.quantity,'Tanggal kebutuhan':p.neededDate,Anggaran:p.budget,'Pesan / catatan':p.message}).map(([k,v])=>[k,esc(v||'—').replaceAll('\n','<br>')]))+form('message-review',select('status','Status tindak lanjut',Object.entries(MESSAGE_STATUS),r.status)+area('note','Catatan untuk pengirim',r.reviewNote),'Simpan tindak lanjut');
    bindForm('message-review',async d=>{await customerMessages(U.store,{stamp:()=>U.c.fs.serverTimestamp()}).review(U.ctx,{...d,id:r.id,revision:r.revision});await U.render();message('Tindak lanjut tersimpan.');});$('#message-detail').scrollIntoView({behavior:'smooth'});
  });
}
