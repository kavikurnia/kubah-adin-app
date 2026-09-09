import {check,hash,str} from './manual-domain.js?v=katalog-pembeli-20260909-r7';

export const PROGRAMS = [
  ['haji','Kebutuhan Oleh-Oleh Haji & Umroh','Ajukan kebutuhan produk berdasarkan jumlah penerima, anggaran, dan tanggal kebutuhan.'],
  ['souvenir','Paket Souvenir Hajatan & Tahlil','Sampaikan produk, jumlah paket, dan kebutuhan kemasan untuk diperiksa toko.'],
  ['fashion','Layanan untuk Toko Fashion Muslim','Diskusikan pengadaan stok awal dan pengisian stok berkala.'],
  ['travel','Travel Haji & Umroh','Sampaikan kebutuhan perlengkapan jamaah atau oleh-oleh rombongan.'],
  ['lembaga','Masjid, Musholla & Pesantren','Ajukan kebutuhan perlengkapan ibadah untuk lembaga Anda.'],
  ['hampers','Hampers Perusahaan & Komunitas','Sampaikan anggaran, jumlah penerima, dan pilihan produk untuk paket hadiah.'],
  ['agen','Mitra Pembukaan Toko & Agen Daerah','Konsultasikan pilihan stok awal dan pengadaan berkala.']
];
export const MESSAGE_STATUS={new:'Baru',reviewing:'Ditinjau',needs_info:'Perlu informasi',closed:'Selesai'};
export function messagePayload(raw){
  const p={};for(const [k,n] of Object.entries({program:30,name:150,business:150,phone:30,email:150,city:150,topic:200,needs:1500,quantity:150,neededDate:10,budget:150,message:3000}))p[k]=str(raw[k]||'',n).trim();
  check(p.program==='contact'||PROGRAMS.some(([k])=>k===p.program),'Program tidak tersedia. Supplier dan Reseller menggunakan formulir tersendiri.');
  check(p.name&&p.message,'Nama dan pesan wajib diisi.');p.phone=p.phone.replace(/[\s()-]/g,'');check(/^\+?[0-9]{7,15}$/.test(p.phone),'Isi nomor WhatsApp yang valid.');
  check(!p.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email),'Email tidak valid.');
  if(p.program==='contact')check(p.topic,'Topik wajib diisi.');else check(p.city&&p.needs&&p.quantity,'Kota, kebutuhan, dan perkiraan jumlah wajib diisi.');
  check(!p.neededDate||/^\d{4}-\d{2}-\d{2}$/.test(p.neededDate)&&!Number.isNaN(Date.parse(p.neededDate)),'Tanggal tidak valid.');return p;
}
export const messageNumber=id=>'MSG-'+hash(id).slice(0,12).toUpperCase();
export function customerMessages(store,{stamp=()=>new Date().toISOString()}={}){return {
  async submit(uid,raw,key){
    check(uid,'Masuk ke akun toko terlebih dahulu.');check(/^[A-Za-z0-9_-]{8,64}$/.test(key),'Kunci pesan tidak valid.');const payload=messagePayload(raw),id=uid+'_'+key,path='customerMessages/'+id,requestHash=hash(payload);
    return store.run(async tx=>{const old=await tx.get(path);if(old){check(old.customerId===uid&&old.requestHash===requestHash,'Percobaan sebelumnya memakai isi berbeda. Periksa Pesan Saya sebelum mengirim pesan baru.');return {id,number:messageNumber(id),reused:true};}
      tx.set(path,{customerId:uid,key,payload,requestHash,status:'new',reviewNote:'',revision:1,createdAt:stamp(),updatedAt:stamp()});return {id,number:messageNumber(id),reused:false};});
  },
  async review(ctx,{id,status,note,revision}){
    check(ctx.role==='admin','Akses admin diperlukan.');check(Object.hasOwn(MESSAGE_STATUS,status),'Status tidak valid.');note=str(note,2000,true).trim();check(note,'Isi catatan tindak lanjut.');
    return store.run(async tx=>{const path='customerMessages/'+id,old=await tx.get(path);check(old&&old.revision===revision,'Pesan berubah. Muat ulang sebelum menyimpan.');tx.update(path,{status,reviewNote:note,revision:revision+1,updatedAt:stamp(),reviewedBy:ctx.uid});return {id};});
  }
};}
