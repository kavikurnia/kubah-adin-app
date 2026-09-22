// Presentation only: never write product data or change pricing/stock.
export function descriptionText(value, documentRef=document){
  const fragment=documentRef.createElement('template');
  fragment.innerHTML=String(value??'').replace(/<\s*br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|div|h[1-6]|li|section|blockquote|tr)>/gi,'$&\n');
  fragment.content.querySelectorAll('script,style,iframe,object,template,noscript,svg').forEach(el=>el.remove());
  return fragment.content.textContent.replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim();
}

export function galleryPosition(index,length){return length?((index%length)+length)%length:0;}
export function swipeStep(dx,dy,width){
  return Math.abs(dx)>=Math.min(60,Math.max(32,width*.12))&&Math.abs(dx)>Math.abs(dy)*1.5?(dx<0?1:-1):0;
}

export function galleryHTML(urls,name,esc){
  if(!urls.length)return '<div class="empty">Foto belum tersedia</div>';
  const multiple=urls.length>1;
  return `<section class="product-gallery" aria-label="Foto produk">
    <div class="gallery-stage" ${multiple?'tabindex="0" aria-label="Galeri foto. Geser kiri atau kanan, atau gunakan tombol panah."':''}>
      <img id="gallery-main" class="gallery-main" src="${esc(urls[0])}" alt="${esc(name)} — foto 1 dari ${urls.length}" draggable="false">
      ${multiple?'<button class="gallery-arrow gallery-prev" type="button" data-gallery-step="-1" aria-label="Foto sebelumnya">‹</button><button class="gallery-arrow gallery-next" type="button" data-gallery-step="1" aria-label="Foto berikutnya">›</button>':''}
    </div>
    ${multiple?`<p class="gallery-position" role="status" aria-live="polite" aria-atomic="true"><span data-gallery-position>1/${urls.length}</span></p><div class="gallery-thumbs" aria-label="Pilih foto produk">${urls.map((url,i)=>`<button type="button" data-gallery-index="${i}" aria-label="Lihat foto ${i+1} dari ${urls.length}" aria-pressed="${i===0}"><img src="${esc(url)}" alt="" loading="lazy" draggable="false"></button>`).join('')}</div>`:''}
  </section>`;
}

export function mountGallery(root,urls,name){
  const stage=root.querySelector('.gallery-stage'),main=root.querySelector('#gallery-main');
  if(!stage||!main)return {select:()=>{}};
  const thumbs=[...root.querySelectorAll('[data-gallery-index]')],strip=root.querySelector('.gallery-thumbs'),position=root.querySelector('[data-gallery-position]');
  let index=0,gesture=null,suppressClickUntil=0;
  function select(next){
    index=galleryPosition(next,urls.length);
    main.src=urls[index];main.alt=`${name} — foto ${index+1} dari ${urls.length}`;
    if(position)position.textContent=`${index+1}/${urls.length}`;
    thumbs.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
    const active=thumbs[index];
    if(active&&strip){
      // Move only the thumbnail strip; do not scroll the dialog or page.
      const a=active.getBoundingClientRect(),s=strip.getBoundingClientRect();
      if(a.left<s.left)strip.scrollLeft-=s.left-a.left+4;
      else if(a.right>s.right)strip.scrollLeft+=a.right-s.right+4;
    }
  }
  thumbs.forEach(b=>b.addEventListener('click',()=>select(Number(b.dataset.galleryIndex))));
  root.querySelectorAll('[data-gallery-step]').forEach(b=>b.addEventListener('click',()=>select(index+Number(b.dataset.galleryStep))));
  root.querySelectorAll('[data-image]').forEach(b=>b.addEventListener('click',()=>{const at=urls.indexOf(b.dataset.image);if(at>=0)select(at);}));
  if(urls.length>1){
    stage.addEventListener('keydown',e=>{if(e.target!==stage)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select(index+(e.key==='ArrowLeft'?-1:1));}});
    stage.addEventListener('dragstart',e=>e.preventDefault());
    stage.addEventListener('pointerdown',e=>{
      if(!e.isPrimary||e.button!==0||e.target.closest('button'))return;
      gesture={id:e.pointerId,x:e.clientX,y:e.clientY,axis:null};
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove',e=>{
      if(gesture?.id!==e.pointerId)return;
      const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
      if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>10)gesture.axis=Math.abs(dx)>Math.abs(dy)*1.5?'x':'y';
      if(gesture.axis==='x'&&e.cancelable)e.preventDefault();
    });
    stage.addEventListener('pointerup',e=>{
      if(gesture?.id!==e.pointerId)return;
      const g=gesture;gesture=null;
      const step=g.axis==='y'?0:swipeStep(e.clientX-g.x,e.clientY-g.y,stage.clientWidth);
      if(step){select(index+step);suppressClickUntil=Date.now()+400;}
      if(stage.hasPointerCapture?.(e.pointerId))stage.releasePointerCapture(e.pointerId);
    });
    const cancel=()=>{gesture=null;};
    stage.addEventListener('pointercancel',cancel);stage.addEventListener('lostpointercapture',cancel);
    stage.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();}},true);
  }
  return {select};
}
