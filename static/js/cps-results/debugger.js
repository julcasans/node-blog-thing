
function debugger_dash_step(msg) {
    $("#expr").html(msg);
}

function clear_expr() {
    $("#expr").html('');
}

$(function() {
    $('#toggle-bp,#continue,#step').attr('disabled', 'true');

    var started = false;
    $('#start').on('click', function() {
        if(started) {
            window.stop_box_render();
            $(this).html('start');
            started = false;

            if(debugger_dash_stepping_p_()) {
                $('#toggle-bp').trigger('click');
            }

            $('#toggle-bp,#continue,#step').each(function() {
                this.disabled = true;
            });
        }
        else {
            window.start_box_render();
            $(this).html('stop');
            started = true;
            $('#toggle-bp,#continue,#step').each(function() {
                this.disabled = false;
            });
        }
    });

    var bp = false;
    $("#toggle-bp").on("click", function() {
        if(bp) {
            disable_dash_breakpoints();
            stop_dash_stepping();
            debugger_dash_continue();
            bp = false;
            $(this).html('enable breakpoints');
            clear_expr();
        }
        else {
            enable_dash_breakpoints();
            bp = true;
            $(this).html('disable breakpoints');
        }
    });

    $("#continue").on("click", function() {
        if(debugger_dash_stepping_p_()) {
            stop_dash_stepping();
            debugger_dash_continue();
        }
    });

    $("#step").on("click", function() {
        if(debugger_dash_stepping_p_()) {
            start_dash_stepping();
            debugger_dash_continue();
        }
    });
});