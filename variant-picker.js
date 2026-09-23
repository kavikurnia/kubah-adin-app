import {esc,money,safeURL} from './shop-client.js?v=picker-20260923-r21';
import {pickerAxes,primaryPhoto,variantLabel,inCart,remaining,matchingVariants,selectedVariant,changeSelection,optionAvailable,pickerQuote,pickerRange} from './variant-picker-domain.js?v=picker-20260923-r21';
import {quoteSignature} from './catalog-domain.js?v=picker-20260923-r21';

// One presentation component. Pricing, stock and variant IDs use existing catalogue data.
export function openVariantPicker({product,context,refresh,commit,buy=false,onClose=()=>{}}){
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='variant-picker';dialog.setAttribute('aria-labelledby','picker-title');
 let p=product,selection={color:null,size:null},qty='1',multiple=false,multi={},saving=false,error='',closed=false;
 const safe=raw=>esc(safeURL(raw));
 function close(){if(!saving)dialog.close();}
 dialog.addEventListener('close',()=>{closed=true;dialog.remove();document.body.classList.remove('picker-open');onClose();if(previous?.isConnected)previous.focus();});
 dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 function rows(){if(multiple)return Object.entries(multi).filter(([,n])=>n!=='').map(([variantId,n])=>({variantId,qty:Number(n)}));const v=selectedVariant(p,selection);return v?[{variantId:v.id,qty:Number(qty)}]:[];}
 const quote=()=>pickerQuote({...context(),product:p,rows:rows()});
 function hint(){const missing=pickerAxes(p).filter(a=>selection[a.key]==null).map(a=>a.name.toLocaleLowerCase('id'));return missing.length?'Pilih '+missing.join(' dan ')+' terlebih dahulu.':!selectedVariant(p,selection)?'Kombinasi tidak tersedia atau perlu diperiksa admin.':'';}
 function summary(){
  const c=context(),v=selectedVariant(p,selection),range=pickerRange(p,selection,c);let q,problem='';try{q=quote();}catch(e){problem=e.message;}
  const line=q?.quote.items.find(i=>i.productId===p.id&&i.variantId===v?.id);
  dialog.querySelector('[data-picker-price]').textContent=multiple?'Pilih beberapa varian':line?money(line.price):range?(range.min===range.max?money(range.min):money(range.min)+' – '+money(range.max)):'Stok tidak tersedia';
  dialog.querySelector('[data-picker-stock]').textContent=v?`Stok ${v.stock} ${p.saleUnit||'unit'}${inCart(c.cart,p.id,v.id)?' · '+inCart(c.cart,p.id,v.id)+' di keranjang':''}`:'Stok ditampilkan setelah kombinasi dipilih';
  const notice=dialog.querySelector('[data-picker-notice]');notice.textContent=error||(multiple?problem:hint()||problem)||(q?`${q.quote.pcs} pcs di keranjang setelah ditambahkan · ${money(q.quote.subtotal)}. Belum termasuk ongkir.`:'');notice.classList.toggle('error',!!error||!!problem&&!!rows().length); 
  dialog.querySelector('[data-picker-total]').textContent=q?'Pilihan ini '+money(q.addedTotal):'Lengkapi pilihan';
  const kind=dialog.querySelector('[data-price-kind]');kind.textContent=line?`Harga ${line.priceKind} / ${p.saleUnit||'unit'} · ${p.packPcs} pcs per unit`:`Per ${p.saleUnit||'unit'} · ${p.packPcs} pcs per unit`;
  const candidates=matchingVariants(p,selection),formatRange=values=>{const lo=Math.min(...values),hi=Math.max(...values);return lo===hi?money(lo):money(lo)+'–'+money(hi);};
  dialog.querySelector('[data-picker-pricing]').textContent=candidates.length?'Eceran '+formatRange(candidates.map(v=>v.pricing?.retail||p.price))+(p.tiers||[]).map(t=>' · Grosir '+formatRange(candidates.map(v=>v.pricing?.wholesale||t.price))+' (min. '+t.minPcs+' pcs)').join(''):'';
  dialog.querySelectorAll('[data-multi-price]').forEach(el=>{const v=p.variants.find(v=>v.id===el.dataset.multiPrice),priced=q?.quote.items.find(i=>i.productId===p.id&&i.variantId===v.id);el.textContent=`${money(priced?.price||(v.pricing?.retail||p.price))} ${priced?.priceKind||'eceran'} · stok ${v.stock}`;});
  const input=dialog.querySelector('[data-picker-qty]');if(input){input.max=v?remaining(p,v,c.cart):0;input.disabled=!v||saving;dialog.querySelector('[data-qty-step="-1"]').disabled=!v||saving||Number(qty)<=1;dialog.querySelector('[data-qty-step="1"]').disabled=!v||saving||Number(qty)>=remaining(p,v,c.cart);}
  dialog.querySelector('[data-picker-submit]').disabled=saving||!p.variants.some(v=>remaining(p,v,c.cart)>0);
 }
 function render(){
  const c=context(),axes=pickerAxes(p),v=selectedVariant(p,selection),byColor=selection.color!=null?p.variants.filter(v=>String(v.color||'')===selection.color):[],image=v?.image||byColor.find(v=>v.image)?.image||primaryPhoto(p);
  dialog.innerHTML=`<header class="picker-head">${safeURL(image)?`<img class="picker-photo" src="${safe(image)}" alt="${esc(selection.color||p.name)}">`:'<span class="picker-photo placeholder">Foto belum tersedia</span>'}<div class="picker-heading"><h2 id="picker-title">${esc(p.name)}</h2><strong class="picker-price" data-picker-price></strong><small data-price-kind></small><small data-picker-stock></small></div><button type="button" data-picker-close aria-label="Tutup pilihan varian">×</button></header><div class="picker-body">
   <div class="picker-modes"><span>${esc(c.mode==='grosir'?'Belanja grosir':'Belanja eceran')}</span>${p.variants.length>1?`<button type="button" data-picker-multiple aria-pressed="${multiple}">${multiple?'Pilih satu varian':'Beli beberapa varian'}</button>`:''}</div>
   ${multiple?`<p class="picker-help">Isi jumlah yang dibutuhkan. Kolom kosong tidak ditambahkan.</p><div class="picker-multi-list">${p.variants.map(v=>`<label class="picker-multi-row">${safeURL(v.image||primaryPhoto(p))?`<img src="${safe(v.image||primaryPhoto(p))}" alt="">`:''}<span><strong>${esc(variantLabel(v))}</strong><small data-multi-price="${esc(v.id)}"></small></span><input type="number" inputmode="numeric" min="1" max="${remaining(p,v,c.cart)}" step="1" data-multi-qty="${esc(v.id)}" value="${esc(multi[v.id]||'')}" aria-label="Jumlah ${esc(variantLabel(v))}" placeholder="0" ${remaining(p,v,c.cart)===0?'disabled':''}></label>`).join('')}</div>`:
   axes.map(a=>`<fieldset class="picker-options"><legend>${esc(a.name)}</legend><div class="picker-option-list">${a.values.map(value=>{const available=optionAvailable(p,a.key,value,selection,c.cart),active=selection[a.key]===value,photo=a.key==='color'?(p.variants.find(v=>String(v.color||'')===value&&v.image)?.image||primaryPhoto(p)):'';return `<button type="button" class="picker-option ${a.key==='color'?'with-photo':''}" data-axis="${a.key}" data-option="${esc(value)}" aria-pressed="${active}" ${!available?'disabled':''}>${safeURL(photo)?`<img src="${safe(photo)}" alt="">`:''}<span>${esc(value||'Standar')}${!available?'<small>Tidak tersedia</small>':''}</span>${active?'<b aria-hidden="true">✓</b>':''}</button>`;}).join('')}</div></fieldset>`).join('')+`<div class="picker-quantity"><label for="picker-quantity">Jumlah</label><div class="quantity-stepper"><button type="button" data-qty-step="-1" aria-label="Kurangi jumlah">−</button><input id="picker-quantity" data-picker-qty type="number" min="1" step="1" inputmode="numeric" value="${esc(qty)}"><button type="button" data-qty-step="1" aria-label="Tambah jumlah">+</button></div></div>`}
   <p class="picker-help" data-picker-pricing></p>${p.tiers?.length?`<p class="picker-help">Gabungan minimum: ${p.combine==='product'?'antarvarian produk ini':p.combine==='all'?'produk dalam kelompok harga yang sama':'masing-masing varian'}. ${c.mode==='eceran'?'Pilih mode Grosir pada katalog untuk harga grosir.':''}</p>`:''}<p class="picker-notice" data-picker-notice role="status" aria-live="polite"></p></div><footer class="picker-footer"><span data-picker-total></span><button type="button" class="primary" data-picker-submit>${buy?'Beli Sekarang':'Masukkan Keranjang'}</button></footer>`;
  dialog.querySelector('[data-picker-close]').onclick=close;
  dialog.querySelector('[data-picker-multiple]')?.addEventListener('click',()=>{multiple=!multiple;error='';render();});
  dialog.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>{selection=changeSelection(p,selection,b.dataset.axis,b.dataset.option,context().cart);error='';render();});
  dialog.querySelector('[data-picker-qty]')?.addEventListener('input',e=>{qty=e.target.value;error='';summary();});
  dialog.querySelectorAll('[data-qty-step]').forEach(b=>b.onclick=()=>{qty=String(Math.max(1,(Number(qty)||1)+Number(b.dataset.qtyStep)));error='';dialog.querySelector('[data-picker-qty]').value=qty;summary();});
  dialog.querySelectorAll('[data-multi-qty]').forEach(i=>i.oninput=()=>{multi[i.dataset.multiQty]=i.value;error='';summary();});
  dialog.querySelector('[data-picker-submit]').onclick=submit;
  summary();
 }
 async function submit(){
  if(saving)return;error='';if(!multiple&&hint()){error=hint();summary();return;}
  let before;try{before=quote();}catch(e){error=e.message;summary();return;}
  const chosen=rows(),c=context();saving=true;dialog.querySelectorAll('button,input').forEach(b=>b.disabled=true);dialog.querySelector('[data-picker-submit]').textContent='Memeriksa…';
  try{
   await refresh();if(closed)return;p=context().products.find(v=>v.id===product.id);if(!p)throw Error('Produk sudah tidak tersedia. Keranjang belum diubah.');
   if(c.owner!==context().owner)throw Error('Akun berubah. Buka kembali pilihan varian.');
   const after=pickerQuote({...context(),product:p,rows:chosen});
   if(quoteSignature(before.quote)!==quoteSignature(after.quote))throw Error('Harga atau keranjang berubah. Rincian terbaru ditampilkan; periksa lalu coba kembali.');
   await commit(after.cart,buy);saving=false;dialog.close();
  }catch(e){p=p||product;error=e.message||'Belum berhasil. Pilihan tetap tersedia untuk dicoba lagi.';saving=false;render();}
 }
 document.body.append(dialog);document.body.classList.add('picker-open');render();dialog.showModal();
 return {close};
}
