/**
 * This code snippet makes "k" tags in the HTML
 * document convert to KaTeX-rendered elements.
 */

$(function() {
  $('k').each(function() {
    src = $(this).text();
    if ($(this).attr("display") != undefined)
      src = "\\displaystyle{" + src + "}";
    katex.render(src, this);
  });
  $('k span').each(function() {
    if ($(this).text() == "@") {
      id = $(this).next().text();
      if (id == "@") {
    	$(this).next().remove();
      }
      else {
        $(this).next().next().attr('id', id);
        $(this).next().remove();
        $(this).remove();
      }
    }
  });
});
