var outlet = require('/outlet.js');
var util = require('util');

util.inspect = function(obj) {
    if(obj.toSource) {
        return obj.toSource();
    }
    else {
        return '' + obj;
    }    
}

document.addEventListener('DOMContentLoaded', function() {
    $('.compile input').click(function(e) {
        var target = $(e.target);
        var program = target.parents('.program');
        var src_el = program.children('.input');
        var src = src_el.val();

        function clear() {
            program.find('.output pre').text('');
        }

        function append(msg) {
            var output = program.find('.output pre');
            output.text(output.text() + msg);
        }

        function print_result(obj) {
            append('--- result\n');
            if(typeof(obj) == 'object' && obj.toSource) {
                append(obj.toSource());
            }
            else {
                append(obj);
            }
        }

        function print_code(code) {
            append('\n--- compiled js\n')
            append(code);
        }

        clear();

        try {
            var code = outlet.compile(src);

            try {
                print_result(eval(code));
            }
            catch(e) {
                print_result('error: ' + e.message);
            }

            print_code(code);
        }
        catch(e) {
            print_result(e.message);
        }
    });
});