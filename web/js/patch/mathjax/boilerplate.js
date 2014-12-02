/**
 * Offers some boilerplate code to create MathJax objects dynamically in jQuery
 */

function Jax(src, on_ready) {
  var _this = this;
  this._on_ready = on_ready || function() {};

  var ma = $("<script>").attr('type', 'math/tex')
    .text(src).wrapAll("<span/>").parent();

  MathJax.Hub.Queue(
    ["Typeset", MathJax.Hub, ma[0]],
    function() { 
      _this.elements = ma.children();
      _this._on_ready.call(_this, _this.elements); 
    }
  );
}

Jax.prototype.ready = function(callback) {
  if (this.elements)
    callback.call(this, this.elements);
  else this._on_ready = callback;
} 
