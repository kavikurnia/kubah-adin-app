import {check,str,hash,id} from './manual-domain.js?v=picker-20260923-r21';
export function customerService(store){
 const actor=ctx=>{check(ctx?.role==='admin'&&ctx.uid,'Akses admin diperlukan.','permission-denied');return ctx.uid;};
 const fields=d=>({name:str(d.name,150,true),phone:str(d.phone,30,true),address:str(d.address||'',1000)});
 return {
  async save(ctx,data,customerId){
   const by=actor(ctx),value=fields(data),matches=await store.list('customers',[['phone','==',value.phone]]);
   check(matches.length<=1,'Ada beberapa data dengan nomor ini. Tinjau data lama; jangan gabungkan otomatis.');
   check(!customerId||!matches.length||matches[0].id===customerId,'Nomor HP sudah dipakai pelanggan lain.');
   const key=customerId?id(customerId):matches[0]?.id||'CUS-'+hash(value.phone),path='customers/'+key;
   return store.run(async tx=>{const old=await tx.get(path);check(!customerId||old,'Pelanggan tidak ditemukan.');check(customerId||!old||old.phone===value.phone,'Identitas pelanggan berubah. Muat ulang.');const stamp=store.serverTimestamp();tx.set(path,{...old,...value,active:old?.active!==false,createdAt:old?.createdAt||stamp,updatedAt:stamp,updatedBy:by});return {id:key,updated:!!old};});
  },
  async setActive(ctx,customerId,active){const by=actor(ctx),path='customers/'+id(customerId);check(typeof active==='boolean','Status tidak valid.');return store.run(async tx=>{const old=await tx.get(path);check(old,'Pelanggan tidak ditemukan.');tx.update(path,{active,updatedBy:by,updatedAt:store.serverTimestamp()});return {id:customerId};});}
 };
}
