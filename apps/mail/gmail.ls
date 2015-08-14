fs = require \fs
path = require \path
gui = require 'nw.gui'

here = path.dirname(window.location.pathname)
local-file = -> path.join here, it
read = -> fs.readFileSync it, 'utf-8'

devkey = JSON.parse read local-file 'webapp.json'
if devkey.installed?
  o = devkey.installed
  redirect-uri = 'urn:ietf:wg:oauth:2.0:oob'
  response-type = 'code'
else
  o = devkey.web
  redirect-uri = 'http://example.com'
  response-type = 'token'

scope = 'profile https://www.googleapis.com/auth/gmail.readonly'

auth-uri = "#{o.auth_uri}?scope=#{scope}&redirect_uri=#{redirect-uri}&response_type=#{response-type}&client_id=#{o.client_id}" #&approval_prompt=force"

class OAuthClient

  (@uri) ->
    @credentials = null

  log: ->
    console.log it

  token: ->
    @credentials?.token

  authorize: (cb=->) ->
    @w = w = gui.Window.open(@uri, {show: false})
    self = @
    w.addListener 'loading' -> 
      self.log "loading '#{@title}'"
      @hide!
    w.addListener 'loaded' -> 
      console.log "loaded '#{@title}'"
      if (mo = @title.match /^Success code=(.*)/)
        self.log (self.credentials = {code: mo[1]})
        cb.call self
        @close!
      else if (mo = @window.location.hash?.match /^#access_token=(.*?)&/)
        self.log (self.credentials = {token: mo[1]})
        @close!
        cb.call self
      else
        @show!
        
        
class GoogleApiClient
  (@oauth) ->
  
  get-uri: (endpoint-path, params, include-cred=true) ->
    if include-cred
      params = {access_token: @oauth.credentials.token} <<< params
    query-string = $.param params, true
    "https://www.googleapis.com/#{endpoint-path}?#{query-string}"
    
  get-headers: ->
    Authorization: "Bearer #{@oauth.credentials.token}"
    
  call: (endpoint-path, params, cb=->) ->
    if typeof params == 'function'
      cb = params ; params = {}
    url = @get-uri endpoint-path, params, false
    $.ajax url, {headers: @get-headers!}
      ..always ~> cb ...
      
  batch: (calls, cb=->) ->
    url = "https://www.googleapis.com/batch"
    headers = {} <<< @get-headers!
    headers['Content-Type'] = 'multipart/mixed; boundary=batch_foobarbaz'
    parts = calls.map ->
      [endpoint-path, params] = it
      query-string = $.param params, true
      "Content-Type: application/http\n\nGET /#{endpoint-path}?#{query-string}\n"
    data = (parts.map (-> "--batch_foobarbaz\n#it\n") .join "") + "--batch_foobarbaz--"  
    console.log data
    $.ajax url, {method: 'POST', headers, data}
      ..always ~> cb ...
      

class HttpMultipart

  @parse = (data) ->
    BOUNDARY = 0
    OUTER_HEADER = 1
    INNER_HEADER = 2
    INNER_BODY = 3
    state = BOUNDARY
    boundary = null
    buffer = []
    bodies = []
    flush = ->
      bodies.push buffer.join ''
      buffer := []
    for line in data.split /\r?\n/
      if state == BOUNDARY
        if boundary == null
          boundary = line
          state = OUTER_HEADER
        else if line == boundary
          state = INNER_HEADER
        else if line == boundary + '--'
          break
        else
          throw new Error "invalid boundary '#line'"
      else if state == OUTER_HEADER
        if line == "" then state = INNER_HEADER
      else if state == INNER_HEADER
        if line == "" then state = INNER_BODY
      else if state == INNER_BODY
        if line == boundary
          flush!
          state = OUTER_HEADER
        else if line == boundary + '--'
          flush!; break
        else
          buffer.push line
    
    bodies
    
  @parseJson = (data) ->
    @parse data .map -> JSON.parse it
        

@ <<< {auth-uri, OAuthClient, GoogleApiClient, HttpMultipart}
