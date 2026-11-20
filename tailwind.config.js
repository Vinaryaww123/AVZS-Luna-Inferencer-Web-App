/* tailwind.config.js — konfigurasi Tailwind CLI.
   content: file yang dipindai untuk kelas (termasuk template HTML di dalam js/).
   colors: nama warna -> variabel di css/style.css, sehingga tema terang/gelap otomatis. */
module.exports={
  content:['./*.html','./js/**/*.js'],
  theme:{extend:{
    colors:{bg:'var(--bg)',sf:'var(--sf)',tx:'var(--tx)',mu:'var(--mu)',bd:'var(--bd)',ac:'var(--ac)',on:'var(--on)',cd:'var(--cd)',er:'var(--er)'},
    fontFamily:{sans:['system-ui','-apple-system','"Segoe UI"','sans-serif']}
  }}
};
