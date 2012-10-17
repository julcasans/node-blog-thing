
$(function() {
    var editor = ace.edit(document.getElementById('editor'));
    editor.setTheme('ace/theme/twilight');
    editor.getSession().setMode('ace/mode/markdown');
    editor.getSession().setUseWrapMode(true);
    editor.renderer.setShowGutter(false);

    //     theme: 'night',
    //     value: window.EDITOR_CONTENTS || '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n',
    //     lineWrapping: true
    // });

    setInterval(function() {
        var text = editor.getValue();
        $.post('/markdown', { doc: text }, function(r) {
            $('#preview .contents').html(r);
        });
    }, 2000);

    $('#save').click(function() {
        var text = editor.getValue();
        var dialog = $('#save-dialog');

        dialog.find('input[name=content]').val(text);
        dialog.show();
    });

    $('#save-dialog form').submit(function(e) {
        if($(this).find('input[name=title]').val() == '') {
            alert('Title is required');
            return false;
        }
    });

    $('.dialog .overlay').live('click', function() {
        $('.dialog').hide();
    });
});
