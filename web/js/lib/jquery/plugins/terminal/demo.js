
function make_js_terminal(div_element)
{
    div_element.terminal(function(command, term) {
        if (command !== '') {
            try {
                var result = window.eval(command);
                if (result !== undefined) {
                    term.echo(new String(result));
                }
            } catch(e) {
                term.error(new String(e));
            }
        } else {
           term.echo('');
        }
    }, {
        greetings: 'Javascript Interpreter',
        name: 'js_demo',
        height: 200,
        prompt: 'js> '});
}


function make_ls_terminal(div_element)
{
    div_element.terminal(function(command, term) {
        if (command !== '') {
            try {
                var result = eval.call(window, LiveScript.compile(command, {bare: true}));
                if (result !== undefined) {
                    term.echo(new String(result));
                }
            } catch(e) {
                term.error(new String(e));
            }
        } else {
           term.echo('');
        }
    }, {
        greetings: 'LiveScript Interpreter',
        name: 'ls_demo',
        height: 200,
        prompt: 'ls> '});
}