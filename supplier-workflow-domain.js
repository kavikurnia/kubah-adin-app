import {check,num,str,hash} from './manual-domain.js?v=admin-supplier-20260909-r3';
import {day,wibDay} from './planning-domain.js?v=admin-supplier-20260909-r3';
export const MATCH_LABELS={incomplete:'Dokumen Belum Lengkap',matched:'Sesuai',difference:'Ada Selisih',reviewed:'Selesai Ditinjau'};
export const APPLICATION_LABELS={new:'Pengajuan Baru',reviewing:'Sedang Ditinjau',needs_info:'Perlu Informasi Tambahan',approved:'Disetujui',rejected:'Ditolak'};
export const PARTNERSHIP_DEFAULT={title:'Menjadi Supplier Kubah Nabawi',description:'Ajukan kerja sama penyediaan produk untuk toko Kubah Nabawi.',requirements:'Cantumkan informasi usaha dan produk yang ditawarkan. Pengajuan ditinjau oleh admin.',buttonText:'Ajukan kerja sama',active:false};
export function purchaseLines(raw,products){
 check(Array.isArray(raw)&&raw.length>0&&raw.length<=20,'Isi 1–20 baris produk.');
 const lines=raw.map(l=>{const p=products.find(p=>p.id===l.productId);check(p,'Produk tidak tersedia.');const quantity=num(Number(l.quantity),1),packPcs=num(Number(l.packPcs),1,100000),unit=str(String(l.unit||'unit'),40,true),unitPrice=num(Number(l.unitPrice),1);check(unit.toLowerCase()!=='pcs'||packPcs===1,'Satuan pcs harus berisi tepat 1 pcs.');const pcs=num(quantity*packPcs,1),total=num(quantity*unitPrice,1);return {productId:p.id,productName:p.name,sku:p.sku||'',unit,quantity,packPcs,pcs,unitPrice,total};});
 check(new Set(lines.map(l=>l.productId)).size===lines.length,'Gabungkan baris produk yang sama.');return lines;
}
const unique=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];
const canonical=v=>v?.toDate? v.toDate().toISOString():Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function compareDocuments(po,receiptRows,invoiceRows){
 const receipts=unique(receiptRows),invoices=unique(invoiceRows),rows=new Map();
 const entry=l=>{if(!rows.has(l.productId))rows.set(l.productId,{productId:l.productId,productName:l.productName||l.productId,units:new Set(),orderedPcs:0,sentPcs:0,goodPcs:0,invoicedPcs:0,poAmount:0,receivedAmount:0,invoiceAmount:0});const r=rows.get(l.productId);r.units.add((l.unit||'unit')+' ('+l.packPcs+' pcs)');return r;};
 for(const l of po?.lines||[]){const r=entry(l);r.orderedPcs+=l.quantity*l.packPcs;r.poAmount+=l.quantity*l.unitPrice;}
 for(const doc of receipts)for(const l of doc.lines||[]){const r=entry(l);r.sentPcs+=l.expected*l.packPcs;r.goodPcs+=l.good*l.packPcs;r.receivedAmount+=l.good*l.unitPrice;}
 for(const doc of invoices)for(const l of doc.lines||[]){const r=entry(l);r.invoicedPcs+=l.quantity*l.packPcs;r.invoiceAmount+=l.quantity*l.unitPrice;}
 const comparison=[...rows.values()].map(r=>({...r,units:[...r.units],poPricePerPcs:r.orderedPcs?r.poAmount/r.orderedPcs:null,invoicePricePerPcs:r.invoicedPcs?r.invoiceAmount/r.invoicedPcs:null,receivedPricePerPcs:r.goodPcs?r.receivedAmount/r.goodPcs:null,quantityDifference:r.invoicedPcs-r.goodPcs,sentDifference:po?r.sentPcs-r.orderedPcs:null,deliveryDifference:po?r.goodPcs-r.orderedPcs:null,priceDifference:(r.invoicedPcs?r.invoiceAmount/r.invoicedPcs:0)-(po?(r.orderedPcs?r.poAmount/r.orderedPcs:0):(r.goodPcs?r.receivedAmount/r.goodPcs:0)),totalDifference:r.invoiceAmount-(po?r.poAmount:r.receivedAmount)}));
 const incomplete=!receipts.length||!invoices.length||invoices.some(d=>!d.lines?.length)||receipts.some(d=>d.status!=='verified')||invoices.some(d=>['pending','correction','dibatalkan'].includes(d.status));
 const difference=comparison.some(r=>r.quantityDifference!==0||r.sentPcs!==r.goodPcs||(po&&(r.deliveryDifference!==0||r.sentDifference!==0))||Math.abs(r.priceDifference)>0.005||r.totalDifference!==0)||invoices.some(d=>d.lines?.length&&d.lines.reduce((s,l)=>s+l.quantity*l.unitPrice,0)!==d.amount);
 return {status:incomplete?'incomplete':difference?'difference':'matched',withoutPO:!po,rows:comparison,poTotal:po?.amount??null,invoiceTotal:invoices.reduce((s,d)=>s+d.amount,0),receiptCount:receipts.length,invoiceCount:invoices.length,
  sourceHash:hash(canonical({po:po||null,receipts:receipts.sort((a,b)=>a.id.localeCompare(b.id)),invoices:invoices.sort((a,b)=>a.id.localeCompare(b.id))}))};
}
export function archiveRows(D){
 const kinds={pos:['PO','pencocokan'],receipts:['Surat jalan','penerimaan'],invoices:['Nota / tagihan','tagihan'],payments:['Bukti pembayaran','pembayaran']};
 const rows=Object.entries(kinds).flatMap(([key,[type,route]])=>(D[key]||[]).map(r=>({...r,archiveId:key+'/'+r.id,kind:key,type,route,number:r.number||r.reference,nominal:r.amount??r.lines?.reduce((s,l)=>s+l.good*l.unitPrice,0)??null})));
 for(const r of D.events||[])if(r.type==='return_credit')rows.push({...r,archiveId:'returns/'+r.id,kind:'returns',type:'Kredit retur',route:'tagihan',sourceId:r.documentId,number:r.reference,nominal:r.amount,status:'verified',date:r.date||wibDay(r.at)});
 return rows.map(r=>({...r,supplierName:D.suppliers?.find(s=>s.id===r.supplierId)?.name||r.supplierName||r.supplierId}));
}
export function archiveFilter(rows,{query='',kind='',from='',to='',status='',supplierId=''}={}){
 if(from)day(from);if(to)day(to);check(!from||!to||from<=to,'Tanggal akhir harus sama atau setelah tanggal awal.');
 const q=query.trim().toLocaleLowerCase('id');return rows.filter(r=>(!q||[r.supplierName,r.number].some(v=>String(v||'').toLocaleLowerCase('id').includes(q)))&&(!kind||r.kind===kind)&&(!status||r.status===status)&&(!from||r.date>=from)&&(!to||r.date<=to)&&(!supplierId||r.supplierId===supplierId)).sort((a,b)=>b.date.localeCompare(a.date)||a.archiveId.localeCompare(b.archiveId));
}
export function partnershipInput(d){return {title:str(d.title,150,true),description:str(d.description,3000,true),requirements:str(d.requirements,4000,true),buttonText:str(d.buttonText,80,true),active:d.active===true};}
export function applicationInput(d){const result={};for(const [k,max] of Object.entries({name:150,pic:150,phone:30,email:150,address:1500,category:200,offer:4000,notes:2000}))result[k]=str(String(d[k]||''),max,k!=='notes');check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email),'Email tidak valid.');check(/^[+\d\s()-]{7,30}$/.test(result.phone),'Nomor kontak tidak valid.');return result;}
