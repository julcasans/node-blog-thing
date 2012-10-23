var u = require('./util');
var ghm = require('./showdown-ghm');

module.exports = function(env) {
    env.addFilter('formatdate', u.formatDate);

    env.addFilter('getParagraphs', function(str, num) {
        // Don't split in the middle of a code block
        var safeLines =  str.split('```')[0].split('\n');
        var lines = [];
        var lastEmpty;
        var numPars = 0;

        // This is stupidly simple, just count the paragraphs by detecting
        // empty lines
        for(var i=0; i<safeLines.length; i++) {
            var line = safeLines[i];
            lines.push(line);

            if(line.match(/^\s*$/)) {
                lastEmpty = true;

                if(numPars > num) {
                    break;
                }
            }
            else if(lastEmpty) {
                numPars++;
            }
        }

        return lines.join('\n');
    });

    env.addFilter('ghm', function(str) {
        return ghm.parse(str);
    });

    env.addFilter('isUpdated', function(post) {
        return post.updatedDate && post.updatedDate != post.date;
    });

    env.addFilter('print', function(msg) {
        console.log(msg);
    });
};