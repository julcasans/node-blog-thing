
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

    var shorturl = $('input[name=shorturl]').val();

    function updatePreview() {
        var text = editor.getValue();

        // Don't show iframes/objects in live preview, it's slow
        text = text.replace(/<(iframe|object)[^>]*>[^<]*<\/[^>]*>/g,
                            '<em>&lt;iframe/object/embed&gt;</em>');

        $.post('/markdown', { doc: text }, function(r) {
            var str = '';

            if(window.CURRENT_USER) {
                str += '<div class="user">Logged in as <strong>' +
                    window.CURRENT_USER + '</strong></div>';
            }
            else {
                str += '<div class="user">Not logged in, unable to save</div>';
            }

            str += r;
            $('#preview .contents').html(str);
        });
    }

    updatePreview();
    setInterval(updatePreview, 2000);

    $('.action.save').click(function() {
        // TODO: use the same function that the server uses
        function slugify(name) {
            return name.replace(/[ !@#$%^&*():"'|?=]/g, '-');
        }

        var text = editor.getValue();
        var dialog = $('#save-dialog');

        dialog.find('input[name=content]').val(text);

        // TODO: don't copy this from the server, share it
        var title;
        var titleMatches = text.replace(/^\s*/, '').match(/^#\s*(.*)/);
        if(titleMatches) {
            title = slugify(titleMatches[1]);
        }
        else {
            title = slugify('[Post]');
        }

        dialog.find('input[name=shorturl]').val(title);
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
            window.location.href = '/' + shorturl;
        }
    });

    $('.dialog .overlay').live('click', function() {
        $('.dialog').hide();
    });
});
