
$(function() {
    var editor = ace.edit(document.getElementById('editor'));
    editor.setTheme('ace/theme/twilight');
    editor.getSession().setMode('ace/mode/markdown');
    editor.getSession().setUseWrapMode(true);
    editor.getSession().setUseSoftTabs(true);
    editor.renderer.setShowGutter(false);
    editor.setShowPrintMargin(false);
    editor.commands.removeCommand('gotoline');
    editor.focus();

    var title = $('input[name=title]').val() || 'Needs title';
    var shorturl = $('input[name=shorturl]').val();

    setInterval(function() {
        var text = editor.getValue();
        $.post('/markdown', { doc: text }, function(r) {
            $('#preview .contents').html(
                '<h1>' + title + '</h1>' + r
            );
        });
    }, 2000);

    $('.action.save').click(function() {
        var text = editor.getValue();
        var dialog = $('#save-dialog');

        dialog.find('input[name=content]').val(text);
        dialog.show();
    });

    $('.action.submit').click(function() {
        var text = editor.getValue();

        if(shorturl) {
            $.post('/email-changes', { content: text,
                                       shorturl: shorturl }, function() {
                window.location.href = '/email-changes';
            });
        }
        else {
            // They should never get here. This is a new post and they
            // aren't authorized to do that.
            window.location.href = '/';
        }
    });

    $('.action.delete').click(function() {
        var shorturl = $('input[name=shorturl]').val();
        if(confirm('Are you sure you want to delete this item?')) {
            $.post('/delete/' + shorturl, function() {
                window.location.href = '/';
            });
        }
    });

    $('.action.exit').click(function(e) {
        e.preventDefault();

        if(confirm('Are you sure you want to leave? '
                   + 'Any changes will be lost')) {
            // todo, don't do this
            window.history.back();
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
