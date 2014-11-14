
function DevRealTime()
{
    namespace = "/dev.realtime";
    this._url = 'http://' + document.domain + ':' + location.port + namespace;
    var path = location.pathname.split('/');
    this.components = [path[path.length-1]];
    this.socket = undefined;
    this.log = $('#log');
    this.populated = false;
}

DevRealTime.prototype = {
    connect: function() {
        var devthis = this;
        this.socket = io.connect(this._url);
        this.socket.on('connect', function() {
            devthis.log.append('<p>Connected.</p>');
            devthis.components.forEach(function (component) { 
                devthis.socket.emit('join-query', {query: devthis.components});
            });
            if (!devthis.populated) {
                devthis.populated = true;
                devthis.socket.emit('refresh', {query: devthis.components});
            }
        });
    }
};