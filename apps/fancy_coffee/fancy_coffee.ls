Client = require('node-xmpp-client')
argv = process.argv
ltx = require('node-xmpp-core').ltx

fs = require('fs')
exec = require('child_process').exec
EventEmitter = require('events')


jid = 'shachari@mit.edu'
password = fs.readFileSync('.password', 'utf-8')

room =
  jid: 'fancycoffee@conference.mit.edu'
  nick: 'shachari0'


class Pinger
  ->
    @h_interval = null
    @h_timeout = null

  cleanup: ->
    if @h_interval? then clearInterval @h_interval
    if @h_timeout? then clearTimeout @h_timeout
    
  install: ->
    if !@h_interval?
      @h_interval = setInterval @.~ping, 60000

  ping: ->
    if !@h_timeout?
      if cl.is-online
        cl.cl.send ping!
      @h_timeout = setTimeout @.~timed-out, 2000

  pong: ->
    if @h_timeout?
      clearTimeout @h_timeout
      @h_timeout := null

  timed-out: ->
    @h_timeout = null
    console.log "Ping timeout."
    cl.try-reconnect!

      
class FancyClient extends EventEmitter

  -> @startUp!
  
  startUp: ->
    @is-online = false
    @pinger = pinger = new Pinger
    pinger.install!

    @cl = cl = new Client jid: jid, password: password, host: 'conference.mit.edu'
    cl.setMaxListeners(2)

    cl.connection.socket.on 'error', (error) ->
      console.error("Socket error: " + error)
      #process.exit 1

    cl.on \online (data) ~>
      @is-online = true
      console.log "Connected as #{data.jid.user}@#{data.jid.domain}/#{data.jid.resource}"
      notify "Connected."
      cl.send new ltx.Element('presence') 

      cl.connection.socket.setTimeout(0)
      cl.connection.socket.setKeepAlive(true, 10000)

      # join room (and request no chat history)
      cl.send new ltx.Element('presence', { to: room.jid+'/'+room.nick }).\
        c('x', { xmlns: 'http://jabber.org/protocol/muc' }).c('history', { maxchars: '0' })

      #  client.send(new ltx.Element('message', { to: room.jid, type: 'groupchat' }).
      #      c('body').t(argv[4])
      #  );

    cl.on \stanza (stanza) ~>
      pinger.pong!
      if is-pong stanza
        console.log Date() + " (pong)"
      else if is-message stanza
        body = stanza.getChild \body
        if body?   # message without body is probably a topic change
          metadata = "#{Date()} [#{stanza.attrs.from}]"
          @emit "notify" body.getText!, metadata
          if stanza.attrs.from == room.jid and body.getText!match /anonymous/
            console.log stanza.root!toString!
          else
            notify body.getText!, metadata
            if !focused then set-unread-count unread-count + 1
      else
        console.log Date()
        console.log stanza.root!toString!
      if is-ping stanza then cl.send pong stanza
      #if is-presence stanza then cl.send new ltx.Element('presence') # presence stanza

    TN = fs.realpathSync './terminal-notifier.app/Contents/MacOS/terminal-notifier'
    notify = (msg, subtitle) ->
      console.log "  >>>  #msg  <<<"
      sub = if subtitle? then "-subtitle '#subtitle'" else ""
      if subtitle? then console.log "  >>>  #subtitle  <<<"
      exec "#TN -title 'Fancy Coffee' #sub -message '#msg'"

    cl.on \error (error) ->
      console.error("Client error: " + error)
      #process.exit 1

    cl.on \disconnect ->
      console.log Date()
      console.log "Disconnected"
    cl.on \offline ~> 
      console.log Date()
      console.log "Now offline."
      @is-online = false

  msg-room: (msg) ->
    @cl.send new ltx.Element('message', { to: room.jid, type: 'groupchat' }).\
      c('body').t(msg)


  try-reconnect: ->
    @cleanup!
    @startUp!

  cleanup: ->
    @pinger?.cleanup!
    @cl?.end!


is-ping = (stanza) -> stanza.name == 'iq' and stanza.getChild('ping')?
is-pong = (stanza) -> stanza.name == 'iq' and stanza.children.length == 0 and stanza.attrs.type == 'result'
ping = -> new ltx.Element('iq', { from: cl.jid, type: \get, id: "c2s1" }).c('ping', {xmlns: 'urn:xmpp:ping'})
pong = (ping) -> a = ping.attrs; new ltx.Element('iq', {to: a.from, from: a.to, id: a.id, type: \result})

is-presence = (stanza) -> stanza.name == 'presence' && stanza.attrs.to != stanza.attrs.from
presence = (presence) -> a = presence.attrs; new ltx.Element('presence', {to: a.from, from: a.to, type: \subscribe})

is-message = (stanza) -> stanza.name == 'message'


unread-count = 0
focused = false

set-unread-count = ->
  win.setBadgeLabel((unread-count := it) || "")

win.on \focus -> 
  focused := true
  set-unread-count 0

win.on \blur -> focused := false


cl = new FancyClient

window.onbeforeunload = -> cl.cleanup!

@ <<< {cl}
