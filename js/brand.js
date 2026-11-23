/* brand.js — APP IDENTITY (used by index.html and app.html)
   - Rename/tagline: edit BRAND below.
   - Change logo: overwrite assets/logo.svg (or point BRAND.logo to another png/jpg/svg).
   - In the app, the logo can also be changed via Settings > Logo (stored in your browser).
   HTML elements filled automatically: data-brand="name" | "tagline" | "logo" (for <img>). */
const BRAND={
  name:'AVZS Luna Inferencer',
  tagline:'One place to run cloud and local AI models: chat, coding, multimodal, research, image, and video.',
  logo:'assets/logo.svg'
};
const LOGO_KEY='luna.logo'; // localStorage key for the uploaded logo
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
