
fs = require \fs
path = require \path
child_process = require \child_process
mkdirp = require \mkdirp
requireg = require \requireg

app-dir = '.'
app-name = path.basename fs.realpathSync app-dir

nwjs-root = path.dirname requireg.resolve 'nw'

app-contents-dir = path.join app-dir, "#{app-name}.app/Contents"
nwjs-contents-dir = path.join nwjs-root, 'nwjs/nwjs.app/Contents'

console.log "-" * 60
console.log "Creating: ", app-contents-dir
console.log "NWjs:     ", path.relative '.', nwjs-contents-dir
console.log "-" * 60

mkdirp.sync app-contents-dir

ln-sf = (target, path) ->
  try
    fs.lstatSync path
    fs.unlinkSync path
  catch
  fs.symlinkSync target, path

cp-r = (src, dest-dir) ->
  child_process.execSync "cp -r '#{src}' '#{dest-dir}'"
  
linkrel = (target, link-path) ->
  link-dir = path.dirname(link-path)
  ln-sf path.relative(link-dir, target), link-path
  
link-to-nwjs = (basename) ->
  linkrel path.join(nwjs-contents-dir, basename), 
    path.join(app-contents-dir, basename)

copy-from-nwjs = (basename) ->
  cp-r path.join(nwjs-contents-dir, basename), app-contents-dir
    
for d in <[ Frameworks MacOS PkgInfo ]>
  link-to-nwjs d

for d in <[ Info.plist Resources ]>
  copy-from-nwjs d
