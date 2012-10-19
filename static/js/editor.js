
$(function() {
    var editor = ace.edit(document.getElementById('editor'));
    editor.setTheme('ace/theme/twilight');
    editor.getSession().setMode('ace/mode/markdown');
    editor.getSession().setUseWrapMode(true);
    editor.getSession().setUseSoftTabs(true);
    editor.renderer.setShowGutter(false);
    editor.setShowPrintMargin(false);
    editor.focus();

    var title = $('input[name=title]').val() || 'Needs title';

    setInterval(function() {
        var text = editor.getValue();
        $.post('/markdown', { doc: text }, function(r) {
            $('#preview .contents').html(
                '<h1>' + title + '</h1>' + r
            );
        });
    }, 2000);

    $('#save').click(function() {
        var text = editor.getValue();
        var dialog = $('#save-dialog');

        dialog.find('input[name=content]').val(text);
        dialog.show();
    });

    $('#delete').click(function() {
        var shorturl = $('input[name=shorturl]').val();
        if(confirm('Are you sure you want to delete this item?')) {
            $.post('/delete/' + shorturl, function() {
                window.location.href = '/';
            });
        }
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
