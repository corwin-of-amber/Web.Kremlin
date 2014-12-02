# encoding=utf-8
import os.path

import json

# monkey-patch to avoid "cannot switch to a different thread" issue
import gevent.monkey ; gevent.monkey.patch_all()

from flask import Flask, render_template, make_response, request
from flask.ext.socketio import SocketIO, emit, join_room  # @UnresolvedImport (there is some dynamic loading trickery)

from webdev.browser.local_storage import SafariLocalStoragePull
from webdev.render.serve_packages import ServePackages
from webdev.datastore.root import DataStoreRoot
from webdev.render.inject import InjectJsonObjectToHtml
from webdev.render.query import PipeQuery, QueryContext
from pattern.collection.basics import Cabinet, NaiveOrderedSet


app = Flask(__name__)
app.config.update(dict(DEBUG=True))
socketio = SocketIO(app)

package_man = ServePackages(app.root_path)


@app.route('/')
def index():
    s = SafariLocalStoragePull()
    s.open_db("file__0*")
    keys = s.pullover("code.*").keys()
    return render_template('devserv.html', items=sorted(keys))

@app.route('/edit')
def edit():
    return render_template('editor.html')

@app.route('/local/<key>')
def serve_from_local_storage(key):
    s = SafariLocalStoragePull()
    s.open_db("file__0*")
    content = package_man.tags(s[key])
    resp = make_response(content, 200)
    #resp.headers['Content-Type'] = "text/plain"
    return resp

@app.route('/ext/<package>/<path:resource>')
def ext_resource(package, resource):
    return package_man.serve(package, resource)

@app.route('/loc/<package>/<path:resource>')
def loc_resource(package, resource):
    return ext_resource(package, resource)

@socketio.on('my event', namespace='/test')
def test_message(message):
    emit('my response', {'data': message['data']})

@socketio.on('my broadcast event', namespace='/test')
def test_broadcast_message(message):
    emit('my response', {'data': message['data']}, broadcast=True)

@socketio.on('connect', namespace='/test')
def test_connect():
    emit('my response', {'data': 'Connected'})

@socketio.on('disconnect', namespace='/test')
def test_disconnect():
    print('Client disconnected')

@socketio.on('connect', namespace='/dev.realtime')
def dev_connect():
    print "Client connected"
    
@socketio.on('join', namespace='/dev.realtime')
def dev_join(message):
    rooms = message['room']
    rooms = rooms if isinstance(rooms, (list, tuple)) else [rooms]
    for room in rooms:
        print "Joining", room
        join_room(room)

@socketio.on('join-query', namespace='/dev.realtime')
def dev_join_query(message):
    query = message['query']
    queries = query if isinstance(query, (list, tuple)) else [query]
    for query in queries:
        query = PipeQuery(query)
        for data_path in query.query:
            room = "/".join(data_path)
            print "Joining", room
            join_room(room)
            key = tuple(data_path)
            depends[key].add(query)
    
@socketio.on('refresh', namespace='/dev.realtime')
def dev_refresh(message):
    query = message['query']
    queries = query if isinstance(query, (list,tuple)) else [query]
    for q in queries:
        query = PipeQuery.parse(q)
        for component in query: on_changed(component)

@app.route("/hi/<room>")
def say_hi_to_dev(room):
    socketio.emit('hi', {}, namespace='/dev.realtime', room=room)
    return "Hi " + room


datastore = DataStoreRoot("app.db")
inject_json = InjectJsonObjectToHtml()
depends = Cabinet().of(NaiveOrderedSet)

context = QueryContext()
context.root = datastore
context.inject = inject_json
context.tags = package_man.tags


@app.route("/app/<path:query>")
def app_datastore(query):
    query = PipeQuery(query)
    if 'edit' in request.args:
        page = query.fetch_view(context)
        return render_template('editor.html', page=page)
    else:
        page = query(context)
        return page.render()

@app.route("/app/<path:query>", methods=["POST"])
def app_datastore_post(query):
    query = query.split('/')
    
    # Acquire contents
    contenttype = request.headers["Content-type"]
    if contenttype.startswith("text/json"):
        data = json.loads(request.data)
    else:
        data = unicode(request.data, 'utf-8')
    if request.form: print request.form
    assert isinstance(data, (str, unicode, list, tuple)), "data is neither text nor sequence"

    # Store new value(s)
    with datastore.transaction(): datastore.put(query, data)
            
    # Notify clients
    on_changed(query)
    return "", 200


def on_changed(data_path):
    for i in xrange(len(data_path)):
        prefix = tuple(data_path[:i+1])
        subscribers = depends.get(prefix, [])
        for query in subscribers:
            room = "/".join(prefix)
            print room, depends
            new_data = query(context).data #PipeQuery([query_data_path])(context).data
            socketio.emit('changed', {'query': unicode(query), 'data': new_data}, namespace='/dev.realtime', room=room)


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0')
