/* tailwind.config.js — Tailwind CLI configuration.
   content: files scanned for classes (including HTML templates inside js/).
   colors: color names -> variables in css/style.css, so light/dark themes update automatically. */
module.exports={
  content:['./*.html','./js/**/*.js'],
  theme:{extend:{
    colors:{bg:'var(--bg)',sf:'var(--sf)',tx:'var(--tx)',mu:'var(--mu)',bd:'var(--bd)',ac:'var(--ac)',on:'var(--on)',cd:'var(--cd)',er:'var(--er)'},
    fontFamily:{sans:['system-ui','-apple-system','"Segoe UI"','sans-serif']}
  }}
};
