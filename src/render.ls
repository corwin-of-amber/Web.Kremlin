fs = require 'fs'
glob = require('glob')
path = require('path')
LiveScript = require('livescript')
CoffeeScript = require('coffee-script')
_ = require('underscore')

pkgconfig = require('./lib/pkg-config')
  
  
macros = (PACKAGES, rootPath="", more-tags={}) ->
  d = {}
  uri = (path, name) ->
    hack = if name is /^boiler/ then 1 else 0
    "#{rootPath}/#{path[hack]}/#name"
  for k, v of PACKAGES
    if v.tags?
      d[k] = {toString: -> @['']}
        for tag, resources of v.tags
          ..[tag] = [mk-tag uri v.path, x for x in resources ? []].join "\n"
  d

mk-tag = (resource) ->
  if resource is /\.js$/ then """<script src="#{resource}"></script>"""
  else if resource is /\.css$/ then "<link rel=\"stylesheet\" text=\"text/css\" href=\"#{resource}\">"


bower-macros = (wd) -> {}
  for dir in and-ancestors wd
    bower = path.join dir, 'bower_components'
    if fs.existsSync(bower) && fs.lstatSync(bower).isDirectory!
      for module in fs.readdirSync(bower)
        bower-json = path.join bower, module, 'bower.json'
        if fs.existsSync(bower-json) && fs.lstatSync(bower-json).isFile!
          try
            main = JSON.parse fs.readFileSync bower-json, 'utf-8' .main
            uri = (resource) -> path.relative(wd, path.join(bower, module, resource))
            ..[module] = [mk-tag uri x for x in main].join "\n"
          catch e
            console.warn("Failed to read #module/bower.json (#bower-json)")

and-ancestors = (dir) -> [dir]
  while fs.realpathSync(dir = path.join(dir, '..')) != '/'
    ..push dir


Files =
  projdir: '.'

  ignore-patterns: ['**/node_modules/**', '**/public/**']

  find-all: (glob-pattern, start-dir, exclude-patterns=[]) ->
    if !start-dir? then start-dir = @projdir
    matches = glob.sync glob-pattern, do
      match-base: true
      cwd: start-dir
      ignore: @ignore-patterns ++ exclude-patterns
    matches.map -> path.join(start-dir, it)
    
  rewriteFileSync: (filename, content) ->
    # This is done to refrain from tripping other fs watchers
    if !(fs.existsSync(filename) && fs.readFileSync(filename, 'utf-8') == content)
      fs.writeFileSync(filename, content)

  Hash:
    _memo: (global._reload_memo = global._reload_memo ? {})
    of: (filename) -> fs.statSync filename .mtime
    is-dirty: (filename) -> @of(filename) !== @_memo[filename]
    commit: (filename) -> @_memo[filename] = @of(filename)
    clear: -> @_memo = global._reload_memo = {}


compile = (reload) ->
  projdir = Files.projdir = reload.projdir
  incdir = reload.there

  ls: ->
    inputs = Files.find-all "*.ls" .filter Files.Hash~is-dirty
    for input in inputs
      output = input + ".js"
      console.log "#{path.basename input} --> #{path.basename output}"
      js = LiveScript.compile(fs.readFileSync(input, 'utf-8'))
      Files.rewriteFileSync(output, js)
      delete global.require.cache[fs.realpathSync(input)]
      delete global.require.cache[fs.realpathSync(output)]
      Files.Hash.commit input

  coffee: ->
    inputs = Files.find-all "*.coffee" .filter Files.Hash~is-dirty
    for input in inputs
      output = input + ".js"
      console.log "#{path.basename input} --> #{path.basename output}"
      js = CoffeeScript.compile(fs.readFileSync(input, 'utf-8'))
      Files.rewriteFileSync(output, js)
      delete global.require.cache[fs.realpathSync(input)]
      delete global.require.cache[fs.realpathSync(output)]
      Files.Hash.commit input

  in: ->
    settings = {interpolate: /<%=(.+?)[/%]>/g}
    inputs = Files.find-all "*.in.html" .filter Files.Hash~is-dirty
    #glob.sync("#{projdir}/**/*.in.html", {ignore: Files.ignore-patterns})
    inputs.map (input) ->
      output = input.replace(/\.in\.html$/, '.html')
      console.log "#{path.basename input} --> #{path.basename output}"
      rootDir = path.relative(path.dirname(output), incdir+'/public')
      macros_ = macros(pkgconfig.PACKAGES, rootDir) <<< bower-macros(path.dirname(output))
      code = fs.readFileSync(input, 'utf-8')
      Files.rewriteFileSync(output, _.template(code, settings)(macros_))
      
  jison: ->
    inputs = Files.find-all "*.jison" .filter Files.Hash~is-dirty
    cli = require 'jison/lib/cli'
    for input in inputs
      output = "#input.js"
      console.log "#{path.basename input} --> #{path.basename output}"
      cli.main {file: input, outfile: output, 'module-type': 'js'}
      delete global.require.cache[fs.realpathSync(output)]
      Files.Hash.commit input
      
  ne: ->
    opts = {export: "grammar"}
    inputs = Files.find-all "*.ne" .filter Files.Hash~is-dirty
    nearley = require 'nearley'
    if typeof(window) != 'undefined' then window.nearley = nearley   # @@@ this hack is needed if the main file does not <script src="nearley">
    [Compile, parserGrammar, generate] = [require('nearley/lib/compile'), require('nearley/lib/nearley-language-bootstrapped'), require('nearley/lib/generate')]
    for input in inputs
      output = "#input.js"
      console.log "#{path.basename input} --> #{path.basename output}"
      new nearley.Parser(parserGrammar.ParserRules, parserGrammar.ParserStart)
        ..feed fs.readFileSync input, 'utf-8'
        generate(Compile(..results[0], opts), opts.export)
          Files.rewriteFileSync(output, ..)
      delete global.require.cache[fs.realpathSync(output)]
      Files.Hash.commit input
      
  ts: ~>
    inputs = Files.find-all "*.ts", , <[**/*.d.ts]>
    console.log inputs
    if @tsbuild?
      console.log "ts: compiling incrementally"
      inputs .= filter Files.Hash~is-dirty
      if inputs.length > 0
        for fn in inputs
          @tsbuild.files{}[fn].version = (@tsbuild.files[fn].version ? 0) + 1
        console.log JSON.stringify @tsbuild.files
        inputs.map @tsbuild~emit-file
    else
      if inputs.length > 0
        ts = require "./typescript"
        @tsbuild = ts.build inputs
    for input in inputs
      Files.Hash.commit input


export compile, Files
