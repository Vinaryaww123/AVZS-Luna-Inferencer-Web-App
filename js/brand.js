/* brand.js — IDENTITAS APLIKASI (dipakai index.html dan app.html)
   - Ganti nama/tagline: ubah BRAND di bawah.
   - Ganti logo: timpa file assets/logo.svg (atau arahkan BRAND.logo ke png/jpg/svg lain).
   - Di aplikasi, logo juga bisa diganti lewat Pengaturan > Logo (disimpan di browser Anda).
   Elemen HTML yang diisi otomatis: data-brand="name" | "tagline" | "logo" (untuk <img>). */
const BRAND={
  name:'AVZS Luna Inferencer',
  tagline:'Satu tempat untuk menjalankan model AI cloud maupun lokal: chat, coding, multimodal, riset, gambar, dan video.',
  logo:'assets/logo.svg'
};
const LOGO_KEY='luna.logo'; // kunci localStorage untuk logo hasil unggahan
function applyBrand(){
  const logo=localStorage.getItem(LOGO_KEY)||BRAND.logo;
  document.querySelectorAll('[data-brand=name]').forEach(e=>e.textContent=BRAND.name);
  document.querySelectorAll('[data-brand=tagline]').forEach(e=>e.textContent=BRAND.tagline);
  document.querySelectorAll('img[data-brand=logo]').forEach(e=>e.src=logo);
  let l=document.querySelector('link[rel=icon]');
  if(!l){l=document.createElement('link');l.rel='icon';document.head.append(l)}
  l.href=logo;document.title=BRAND.name;
}
applyBrand();
