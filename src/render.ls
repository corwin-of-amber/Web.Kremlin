fs = require 'fs'
glob = require('glob')
path = require('path')
LiveScript = require('livescript')
CoffeeScript = require('coffee-script')
_ = require('underscore')

pkgconfig = require('./lib/pkg-config')
  
  
macros = (PACKAGES, rootPath="") ->
  d = {}
  mk-tag = (resource) ->
    if resource is /\.js$/ then "<script src=\"#{resource}\"></script>"
    else if resource is /\.css$/ then "<link rel=\"stylesheet\" text=\"text/css\" href=\"#{resource}\">"
  uri = (path, name) ->
    hack = if name is /^boiler/ then 1 else 0
    "#{rootPath}/#{path[hack]}/#name"
  for k, v of PACKAGES
    if v.tags?
      d[k] = {toString: -> @['']}
        for tag, resources of v.tags
          ..[tag] = [mk-tag uri v.path, x for x in resources ? []].join "\n"
  d


projdir = -> window.projdir
there = -> window.there
  
compile =
  ls: ->
    inputs = glob.sync(projdir!+"/{,{apps,src}/**/}*.ls") 
    inputs.map (input) ->
      output = input + ".js"
      console.log "#{path.basename input} --> #{path.basename output}"
      js = LiveScript.compile(fs.readFileSync(input).toString())
      fs.writeFileSync(output, js)
      delete global.require.cache[fs.realpathSync(input)]
      delete global.require.cache[fs.realpathSync(output)]

  coffee: ->
    inputs = glob.sync(projdir!+"/{,{apps,src}/**/}*.coffee") 
    inputs.map (input) ->
      output = input + ".js"
      console.log "#{path.basename input} --> #{path.basename output}"
      js = CoffeeScript.compile(fs.readFileSync(input).toString())
      fs.writeFileSync(output, js)
      delete global.require.cache[fs.realpathSync(input)]
      delete global.require.cache[fs.realpathSync(output)]

  in: ->
    settings = {interpolate: /<%=(.+?)[/%]>/g}
    inputs = glob.sync(projdir!+"/{,{apps,src}/**/}*.in.html")
    inputs.map (input) ->
      output = input.replace(/\.in\.html$/, '.html')
      console.log "#{path.basename input} --> #{path.basename output}"
      rootDir = path.relative(path.dirname(output), there!+'/public')
      macros_ = macros(pkgconfig.PACKAGES, rootDir)
      code = fs.readFileSync(input).toString()
      fs.writeFileSync(output, _.template(code, settings)(macros_))


export compile
