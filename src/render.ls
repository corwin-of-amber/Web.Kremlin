fs = require 'fs'
glob = require('glob')
path = require('path')
LiveScript = require('livescript')
CoffeeScript = require('coffeescript')
_ = require('underscore')

pkgconfig = require('./lib/pkg-config')
{macros, npm-packages, bower-packages} = require('./package')



and-ancestors = (dir) -> [dir]
  fs-root = path.resolve(dir, '/')
  while fs.realpathSync(dir = path.join(dir, '..')) != fs-root
    ..push dir


template = (code, settings={}) -> (macros) ->
  lookup = (expr) ->
    macros[expr] ? do ->
      [, name, path] = expr.match(//(.*?)(?:[/](.*))?$//)
      lu = macros
      for name.split('.') => lu := lu?[..]
      if path && lu?glob then lu = lu.glob(path)
      lu
  pattern = settings.interpolate ? /<%=\s*(.+?)\s*[/%]>/g
  code.replace pattern, (, expr) -> lookup(expr) ? "<!-- #{expr} not found -->"


Files =
  projdir: '.'

  ignore-patterns: ['**/node_modules/**', '**/bower_components/**', '**/public/**']

  find-all: (glob-pattern, start-dir, exclude-patterns=[]) ->
    if !start-dir? then start-dir = @projdir
    matches = glob.sync glob-pattern, do
      match-base: true
      cwd: start-dir
      ignore: @ignore-patterns ++ exclude-patterns
    matches.map -> path.join(start-dir, it)

  find-closest: (glob-pattern, start-dir) ->
    topmost-dir = fs.realpathSync(@projdir)
    for dir in and-ancestors(start-dir ? @projdir)
      matches = glob.sync glob-pattern, cwd: dir
      if matches.length then return path.join(dir, matches[0])
      # - don't go up beyond topmost
      if fs.realpathSync(dir) == topmost-dir
        break

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
  global = reload.framework
  console = reload.console

  ls: ->
    opts = {map: 'embedded'}
    inputs = Files.find-all "*.ls" .filter Files.Hash~is-dirty
    for input in inputs
      output = input + ".js"
      console.log "#{path.basename input} --> #{path.basename output}"
      _opts = {filename: path.basename(input)} <<< opts
      js = LiveScript.compile(fs.readFileSync(input, 'utf-8'), _opts).code
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
    inputs = Files.find-all "*.in.html" .filter Files.Hash~is-dirty
    inputs.map (input) ->
      output = input.replace(/\.in\.html$/, '.html')
      console.log "#{path.basename input} --> #{path.basename output}"
      rootDir = path.relative(path.dirname(output), incdir+'/public')
      macros_ = macros(pkgconfig.PACKAGES, rootDir) <<< bower-packages(path.dirname(output)) <<< npm-packages(path.dirname(output))
      code = fs.readFileSync(input, 'utf-8')
      Files.rewriteFileSync(output, "<!-- !!! -->\n" + template(code)(macros_))

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
    ts = require('typescript')
    opts = {module: ts.ModuleKind.CommonJS, +inlineSources, +inlineSourceMap}
    {Configs} = require './configs'
    tsconfig = Configs.find('tsconfig.json')
    exclude = [].concat ...do
      for e in tsconfig?json?exclude ? []
        fpe = path.relative(path.resolve('.'), path.resolve(path.dirname(tsconfig.filename), e))
        [fpe, "#fpe/**"]
    inputs = Files.find-all "*.ts", , <[**/typings/browser.d.ts **/typings/browser/**]> ++ exclude
      if ..length > 0 then
        console.log "TypeScript build:", [path.relative(projdir, ..) for inputs], "(config: #{path.relative(projdir, tsconfig?filename ? 'none')})"
        ts = require "./typescript"
        opts <<< ts.parse-options(tsconfig)
    cwd = process.cwd!
    inputs = [path.relative(cwd, ..) for inputs]
    output-func = (input, output, text) ->
      console.log "#{path.basename input} --> #{path.basename output}"
      Files.rewriteFileSync(output, text)
    if @tsbuild?
      inputs .= filter Files.Hash~is-dirty
      if inputs.length > 0
        console.log "ts: compiling incrementally"
        @tsbuild.rebuild inputs, output-func
    else
      if inputs.length > 0
        ts = require "./typescript"
        @tsbuild = ts.build inputs, opts, output-func, console~error
    for input in inputs
      Files.Hash.commit input


export compile, Files
