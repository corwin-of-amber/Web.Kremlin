require! fs
require! glob
require! path
require! underscore: _



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

mk-tag = (resource, module-name) ->
  if resource is /\.js$/ then """<script src="#{resource}"></script>"""
  else if resource is /\.css$/ then "<link rel=\"stylesheet\" text=\"text/css\" href=\"#{resource}\">"
  else "<!-- #{module-name}: unrecognized resource, '#resource' -->"


class Package
  (@name, @path, @main, @origin) ->
    if !_.isArray(@main) then @main = [@main]

  uri: (resource) ->
    path.relative(@origin, path.join(@path, resource))

  exists-file: (resource) -> exists-file(path.join(@path, resource))

  toString: ->
    @mk-tags(@main ++ @_css-autodetect!)

  _css-autodetect: ->  # sneaky!
    [..replace(/[.]js$/, '.css') for @main].filter(@~exists-file)

  mk-tags: (resources) ->
    [mk-tag(@uri(..), @name) for resources].join('\n')
  
  glob: (pattern) ->
    @mk-tags([pattern])  # @todo


bower-packages = (wd) -> {}
  for dir in and-ancestors wd
    for module-subdir in ['bower_components', 'node_modules']
      module-path = path.join dir, module-subdir
      if exists-dir(module-path)
        for module in fs.readdirSync(module-path)
          pkg-dir = path.join(module-path, module)
          bower-json = path.join(module-path, module, 'bower.json')
          if exists-file(bower-json)
            try
              main = JSON.parse fs.readFileSync bower-json, 'utf-8' .main
              if main
                ..[module] = new Package(module, pkg-dir, main, wd)
              else
                ..[module] = "<!-- #{module}: no main file(s) found in #{package-json} -->"
            catch e
              ..[module] = "<!-- #{module}: failed to read #{bower-json} (#{e}) -->"

npm-packages = (wd) -> {}
  for dir in and-ancestors wd
    for module-subdir in ['node_modules']
      module-path = path.join dir, module-subdir
      if exists-dir(module-path)
        for module in fs.readdirSync(module-path)
          pkg-dir = path.join(module-path, module)
          package-json = path.join(module-path, module, 'package.json')
          if exists-file(package-json)
            try
              as-resource = -> if _.isString(it) || _.isArray(it) then it
              manifest = JSON.parse fs.readFileSync package-json, 'utf-8'
                main = as-resource(..browser) || as-resource(..main)
              if main
                ..[module] = new Package(module, pkg-dir, main, wd)
              else
                ..[module] = "<!-- #{module}: no main file(s) found in #{package-json} -->"
            catch e
              ..[module] = "<!-- #{module}: failed to read #{package-json} (#{e}) -->"


exists-dir = (filename) ->
  try fs.statSync(filename).isDirectory!
  catch => false

exists-file = (filename) ->
  try fs.statSync(filename).isFile!
  catch => false

and-ancestors = (dir) -> [dir]
  fs-root = path.resolve(dir, '/')
  while fs.realpathSync(dir = path.join(dir, '..')) != fs-root
    ..push dir



export macros, npm-packages, bower-packages