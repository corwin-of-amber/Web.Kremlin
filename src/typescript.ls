/* 
TypeScript builder

Tradition would dictate writing this in TypeScript,
but this seems to involve too many moving parts and dependencies, which would
render the builder brittle.

So, a LiveScript version of "Incremental build support using the language
services" based on the TypeScript wiki
(https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)
*/

fs = require 'fs'
path = require 'path'
ts = require 'typescript'


build = (root-filenames, options={ module: ts.ModuleKind.CommonJS }) ->
   /*    : string[]      : ts.CompilerOptions */
   # 'options' has an additional flag wrapWithFunction : bool
  
  files = {}   /* : Map<{ version: number }> */
  
  # Initialize the map of file versions
  for fn in root-filenames
    files[fn] = {version: 0}
    
  # Create the language service host to allow the LS to communicate with the host
  services-host =    /* : ts.LanguageServiceHost */
    getScriptFileNames: -> root-filenames
    getScriptVersion: (fn) -> files[fn]?version?toString!
    getScriptSnapshot: (fn) ->
      if fs.existsSync(fn)
        ts.ScriptSnapshot.fromString fs.readFileSync fn, 'utf-8'
      
    getCurrentDirectory: -> process.cwd()
    getCompilationSettings: -> options
    getDefaultLibFileName: (options) -> ts.getDefaultLibFilePath(options)
  
  # Create the language service files
  services = ts.createLanguageService(servicesHost, ts.createDocumentRegistry!)
  
  emit-file = (fn) ->
    output = services.getEmitOutput(fn)

    logErrors(fn);
    
    if output.emitSkipped
      console.log "Emitting #fn failed"
      
    for o in output.outputFiles
      out-fn = o.name.replace /\.js$/, '.ts.js'
      console.log "#{path.basename fn} --> #{path.basename out-fn}"
      if options.wrapWithFunction
        program = "(function() {\n#{o.text}\n}).call(this);"  # < wraps each unit with an anon function
      else
        program = o.text
      # This is done to refrain from tripping other fs watchers
      # notice: copied from Files class in render.ls. Unify?
      if !(fs.existsSync(out-fn) && fs.readFileSync(out-fn, 'utf-8') == program)
        fs.writeFileSync(out-fn, program, 'utf8')
      
  log-errors = (fn) ->
    all-diagnostics = services.getCompilerOptionsDiagnostics()
    .concat(services.getSyntacticDiagnostics(fn))
    .concat(services.getSemanticDiagnostics(fn))

    for diagnostic in all-diagnostics
      message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      if diagnostic.file
        {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        console.error "  Error in #{diagnostic.file.fileName} (#{line + 1},#{character + 1}): #{message}"
      else
        console.error "  Error: #{message}"
    
  # Now emit all the files
  for fn in root-filenames
    emit-file(fn)
    
  {files, emit-file}
    

if (require.main == module)
  console.log(process.argv)
  if (process.argv[2])?
    build([process.argv[2]])

@ <<< {build}