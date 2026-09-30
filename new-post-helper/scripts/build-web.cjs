const path=require('node:path');
require('esbuild').buildSync({
 entryPoints:[path.resolve('web/main.tsx')],outdir:path.resolve('public/assets'),
 entryNames:'app',bundle:true,minify:true,jsx:'automatic',format:'esm',target:'es2022',
 define:{'process.env.NODE_ENV':'"production"'},
});
console.log('Direct dashboard assets built.');
