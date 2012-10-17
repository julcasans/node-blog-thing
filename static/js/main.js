
$(function() {
    function addCodeLineNumbers() {
        if (navigator.appName === 'Microsoft Internet Explorer') { return; }
        $('div.gist-highlight').each(function(i, code) {
            var tableStart = '<table><tbody><tr><td class="gutter">',
            lineNumbers = '<pre class="line-numbers">',
            tableMiddle = '</pre></td><td class="code">',
            tableEnd = '</td></tr></tbody></table>',
            count = $('.line', code).length;
            for (var i=1;i<=count; i++) {
                lineNumbers += '<span class="line-number">'+i+'</span>\n';
            }
            var table = tableStart + lineNumbers + tableMiddle + '<pre>'+$('pre', code).html()+'</pre>' + tableEnd;
            $(code).html(table);
        });
    }

    // Add line numbers to github gists
    addCodeLineNumbers();
});