#!/usr/bin/env lsc

require! {
  fs,
  path,
  child_process,
  mkdirp,
  requireg,
  commander
}

cli-opts = commander
  ..option '-i, --icon <filename>'
  ..parse process.argv[1 to]

package-json =
  try    JSON.parse fs.readFileSync('package.json')
  catch => {}

app-dir = '.'
app-name = cli-opts.args[0] ? package-json.name ? path.basename fs.realpathSync app-dir

nwjs-root = path.dirname fs.realpathSync requireg.resolve 'nw'

app-contents-dir = path.join app-dir, "#{app-name}.app/Contents"
nwjs-contents-dir = path.join nwjs-root, 'nwjs/nwjs.app/Contents'

console.log "-" * 60
console.log "Creating: ", app-contents-dir
console.log "NWjs:     ", nwjs-contents-dir
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

if-exists = (filename) ->
  try   fs.statSync filename ; filename
  catch => void

touch = (filename) ->
  tm = new Date
  fs.utimesSync filename, tm, tm

for d in <[ Frameworks MacOS PkgInfo ]>
  link-to-nwjs d

for d in <[ Info.plist Resources ]>
  copy-from-nwjs d


info-plist = if-exists('Info.plist')
icns = cli-opts.icon ? if-exists('app.icns')

if info-plist?
  cp-r info-plist, app-contents-dir
if icns?
  cp-r icns, path.join app-contents-dir, 'Resources'

# Touch app dir (to force icon refresh)
touch path.dirname(app-contents-dir)
