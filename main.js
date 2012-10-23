var express = require('express');
var nunjucks = require('nunjucks');
var redis = require('redis');
var redisStore = require('connect-redis')(express);
var moment = require('moment');
var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;
var email = require('emailjs/email');

var ghm = require('./showdown-ghm');
var settings = require('./settings');

// Install a scheme mode
var hljs = require('highlight.js');
hljs.LANGUAGES['scheme'] = require('./scheme.js')(hljs);

var ADMINS = ['longster@gmail.com'];

// Util

function formatDate(date, format) {
    if(typeof date == 'number') {
        date = intToDate(date);
    }
    else if(typeof date == 'string') {
        date = intToDate(parseInt(date));
    }

    return date.format(format || 'MMMM Do YYYY');
}

function dateToInt(date) {
    return parseInt(date.format('YYYYMMDD'));
}

function intToDate(x) {
    return moment(x.toString(), 'YYYYMMDD');
}

function previousDates() {
    var current = moment();
    var end = moment().subtract('years', 2);
    var dates = [];

    while(current > end) {
        dates.push(dateToInt(current));
        current = current.subtract('days', 1);
    }

    return dates;
}

function tmpFile() {
    // TODO: use a proper tmp file lib
    return 'blogthing-' + Math.floor(Math.random()*10000) + Date.now();
}

function slugify(name) {
    return name.replace(/[ !@#$%^&*():"'|?=]/g, '-');
}

// Database

var client = redis.createClient();
client.on('error', function(err) {
    console.log('error: ' + err);
});

function dbkey() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('jlongster2');
    return args.join('::');
}

function dbSplitKey(key) {
    return key.split('::');
}

function getAllPosts(includeDrafts, cb) {
    if(_.isFunction(includeDrafts)) {
        cb = includeDrafts;
        includeDrafts = false;
    }

    client.zrevrange(dbkey('posts'), 0, -1, function(err, keys) {
        if(err) {
            throw err;
        }

        getAllPostsByKeys(keys, function(posts) {
            if(!includeDrafts) {
                cb(_.filter(posts, function(p) {
                    return p.published == 'y';
                }));
            }
            else {
                cb(posts);
            }
        });
    });
}

function getPost(key, cb) {
    client.hgetall([key], function(err, obj) {
        if(err) {
            throw err;
        }

        if(obj) {
            obj.tags = (obj.tags && obj.tags.split(',')) || [];
        }

        cb(obj);
    });
}

function getAllPostsByKeys(keys, cb) {
    var posts = [];
    var count = 0;

    if(keys.length) {
        keys.forEach(function(key) {
            getPost(key, function(obj) {
                if(obj) {
                    posts.push(obj);
                }

                count++;

                if(count == keys.length) {
                    cb(posts);
                }
            });
        });
    }
    else {
        cb(posts);
    }
}

function getAllPostsByTag(tag, cb) {
    client.zrevrange(dbkey('tag', tag), 0, -1, function(err, keys) {
        getAllPostsByKeys(keys, cb);
    });
}

function getAllTags(cb) {
    client.keys(dbkey('tag', '*'), function(err, keys) {
        cb(_.map(keys, function(key) {
            var k = dbSplitKey(key);
            return k[k.length - 1];
        }));
    });
}

function renamePost(post, newKey, cb) {
    var key = dbkey('post', post.shorturl);
    var multi = client.multi();

    multi.rename(key, newKey)
        .zrem(dbkey('posts'), key)
        .zadd(dbkey('posts'), post.date, newKey);

    post.tags.forEach(function(tag) {
        multi.zrem(dbkey('tag', tag), key)
            .zadd(dbkey('tag', tag), post.date, newKey);
    });

    multi.exec(function(err) {
        if(err) {
            throw err;
        }

        cb();
    });
}

function getUser(email, cb) {
    client.hgetall(dbkey('user', email), function(err, user) {
        if(user) {
            user.admin = user.admin == 'y';
        }
        cb(user);
    });
}

function saveUser(user, cb) {
    user.admin = user.admin ? 'y' : 'n';
    client.hmset(dbkey('user', user.email), user, cb);
}

// App

var app = express();

app.configure(function() {
    app.use(express.static(__dirname + '/static'));
    app.use(express.bodyParser());
    app.use(express.cookieParser('poop'));
    app.use(express.methodOverride());
    app.use(express.session({ store: new redisStore() }));

    app.use(function(req, res, next) {
        res.locals.user = req.session.user;

        if(!req.session.count) {
            req.session.count = 0;
        }

        res.locals.count = req.session.count++;
        next();
    });
});

app.locals.dev = true;

var env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader('views')
);
env.express(app);

env.addFilter('formatdate', formatDate);

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

// Authentication

require('express-persona')(app, {
    audience: 'http://localhost:4000',

    verifyResponse: function(err, req, res, email) {
        if(err) {
            res.json({ status: "failure", reason: err });
        }
        else {
            getUser(email, function(user) {
                if(user) {
                    req.session.user = user;
                    res.json({ status: "okay", email: email });
                }
                else {
                    user = { email: email,
                             admin: ADMINS.indexOf(email) !== -1 };

                    saveUser(user, function() {
                        req.session.user = user;
                        res.json({ status: "okay",
                                   email: email,
                                   freshman: true });
                    });
                }
            });
        }
    },

    logoutResponse: function(err, req, res) {
        req.session.user = null;

        if(err) {
            res.json({ status: "failure", reason: err });
        }
        else {
            res.json({ status: "okay" });
        }
    }
});

function requireAdmin(req, res, next) {
    if(req.session.user && req.session.user.admin) {
        next();
    }
    else {
        res.status(401).render('auth-error.html');
    }
}

function loggedIn(req, res, next) {
    if(req.session.user) {
        next();
    }
    else {
        res.status(401).render('auth-error.html');
    }
}

// Routes

var spoofUrls = {
    'nunjucks-v0.1.5': '2012/10/11/nunjucks-v0.1.5.html',
    'Javascript-s-Future--Generators': '2012/10/05/javascript-yield.html',

    'Introducing-Nunjucks,-a-Better-Javascript-Templating-System':
    '2012/09/20/nunjucks.html',

    'The-Rise-of-the-Mobile-Web--and-Web-Audio-on-iOS-6-':
    '2012/09/12/web-apps.html',

    'Ahoy--Adventures-in-the-Internet': '2012/07/17/ahoy-internet.html',
    'The-Quest-for-Javascript-CPS--Part-2': '2012/05/18/cps-results.html',

    'Compiling-to-Javascript-in-CPS,-Can-We-Optimize-':
    '2012/05/11/cps-optimizations.html',

    'Tilt-This': '2012/04/03/tilt-this.html',

    'Experimenting-with-Debugging-Languages-in-the-Browser':
    '2012/03/20/debugging-in-the-browser.html',

    'Lisp--It-s-Not-About-Macros,-It-s-About-Read':
    '2012/02/18/its-not-about-macros-its-about-read.html',

    'New-whizz-bang-in-Outlet': '2012/02/16/new-features-in-outlet.html',
    'Outlet-gets-a-Personality': '2012/01/16/outlet-gets-a-personality.html',

    'Outlet-gets-Macros': '2012/01/13/outlet-gets-macros.html',

    'Roadmap-for-the-Outlet-Language':
    '2012/01/10/roadmap-for-the-outlet-language.html',

    'Outlet--My-Lisp-to-Javascript-Experiment':
    '2012/01/04/outlet-my-lisp-to-javascript-experiment.html',

    'Flame--My-2d-Game-Experiment': '2011/12/30/flame-my-2d-game-experiment.html',

    'Rotating-Webpages-with-a-Gamepad':
    '2011/12/29/rotating-webpages-with-a-gamepad.html',

    'SICP-2.6--Church-Numerals': '2011/12/16/sicp-26-church-notation.html',

    'SICP-2.5': '2011/12/14/sicp-25.html',
    'SICP-1.35': '2011/12/13/sicp-135.html',

    'Going-Fullscreen-with-Canvas': '2011/11/21/canvas.html',
    'dom3d--rendering-3d-with-CSS': '2011/08/04/dom3d-rendering-3d-with-css.html'
};

app.get('/', function(req, res) {
    getAllPosts(function(posts) {
        getAllTags(function(tags) {
            res.render('index.html', { posts: posts.slice(0, 5),
                                       tags: tags,
                                       bodyId: 'home' });
        });
    });
});

app.get('/drafts', requireAdmin, function(req, res) {
    getAllPosts(true, function(posts) {
        posts = _.filter(posts, function(p) { return p.published == 'n'; });
        res.render('drafts.html', { posts: posts });
    });
});

app.get('/archive', function(req, res) {
    getAllPosts(function(posts) {
        res.render('archive.html', { posts: posts });
    });
});

app.get('/new', requireAdmin, function(req, res) {
    res.render('editor.html', { availableDates: previousDates() });
});

app.get('/edit/:post', function(req, res) {
    if(req.session.user || req.query.redirected) {
        getPost(dbkey('post', req.params.post), function(obj) {
            res.render('editor.html', { post: obj,
                                        availableDates: previousDates() });
        });
    }
    else {
        res.redirect('/notify-permissions?next=' + req.originalUrl);
    }

});

app.get('/notify-permissions', function(req, res) {
    res.render('notify-permissions.html');
});

app.get(/^\/(.*)$/, function(req, res, next) {
    function renderPost(post) {
        post.rendered = ghm.parse(post.content);
        res.render('post.html', { post: post,
                                  bodyId: post.shorturl,
                                  bodyClass: 'post' });
    }

    var url = req.params[0];

    getPost(dbkey('post', url), function(obj) {
        if(obj) {
            // Old posts ported over had a different URL scheme
            if(spoofUrls[obj.shorturl]) {
                res.redirect(spoofUrls[obj.shorturl]);
            }
            else {
                renderPost(obj);
            }
        }
        else {
            var lookup = _.invert(spoofUrls);

            if(lookup[url]) {
                // This is a spoofed URL, find the real post
                getPost(dbkey('post', lookup[url]), function(obj) {
                    if(obj) {
                        renderPost(obj);
                    }
                    else {
                        next();
                    }
                });
            }
            else {
                next();
            }
        }
    });
});

app.get('/tag/:tag', function(req, res) {
    getAllPostsByTag(req.params.tag, function(posts) {
        res.render('tag.html', { posts: posts });
    });
});

app.get('/freshman', function(req, res) {
    res.render('freshman.html');
});

app.post('/delete/:post', requireAdmin, function(req, res) {
    var key = dbkey('post', req.params.post);

    client.zrem(dbkey('posts'), key);

    getAllTags(function(tags) {
        tags.forEach(function(tag) {
            client.zrem(dbkey('tag', tag), key);
        });
    });

    res.send('ok');
});

app.post('/new', requireAdmin, function(req, res) {
    var content = req.body.content;
    var title = req.body.title;
    var published = req.body.published ? 'y' : 'n';
    var shorturl = slugify(req.body.shorturl || title);
    var date = moment(req.body.date, 'YYYYMMDD');
    var dateInt = dateToInt(date);
    var tags = _.map(req.body.tags.split(','),
                     function(tag) {
                         return tag.replace(/^\s*|\s*$/g, '');
                     });
    if(!title) {
        title = ('Draft ' + formatDate(moment()));
        published = false;
    }

    var key = dbkey('post', shorturl);
    var oldKey = dbkey('post', req.body.prevShorturl);

    function renameAndFetch(cb) {
        getPost(oldKey, function(obj) {
            if(obj && key != oldKey) {
                renamePost(obj, key, function() {
                    cb(obj);
                });
            }
            else {
                cb(obj);
            }
        });
    }

    renameAndFetch(function(obj) {
        var multi = client.multi();

        if(obj && oldKey == '') {
            // User is creating a new page with the same name as
            // another one
            throw new Error('page with same name already exists');
        }

        multi.hmset(key, { shorturl: shorturl,
                            content: content,
                            title: title,
                            published: published,
                            tags: tags.join(',') });

        // The post already exists and is published
        if(published == 'y' && obj && obj.published == 'y') {
            var prevTags = obj.tags;
            multi.hset(key, 'date', dateInt.toString());

            // Update the sorting
            multi.zadd(dbkey('posts'), dateInt, key);

            if(obj.content != content) {
                multi.hset(key,
                           'updatedDate',
                           dateToInt(moment()).toString());
            }

            // Removed from these tags
            _.difference(prevTags, tags).forEach(function(tag) {
                multi.zrem(dbkey('tag', tag), key);
            });

            // Added these tags
            _.difference(tags, prevTags).forEach(function(tag) {
                multi.zadd(dbkey('tag', tag), obj.date, key);
            });
        }

        // The post either didn't exist or wasn't published, and
        // should be
        else if(published == 'y') {
            multi.hset(key, 'date', dateInt.toString());
            multi.zadd(dbkey('posts'), dateInt, key);

            tags.forEach(function(tag) {
                multi.zadd(dbkey('tag', tag), dateInt, key);
            });
        }

        // Otherwise, just make it a draft
        else {
            // If previously published, remove certain fields
            if(obj && obj.published == 'y') {
                multi.hdel(key, 'updatedDate');

                obj.tags.forEach(function(tag) {
                    multi.zrem(dbkey('tag', tag), key);
                });
            }

            var now = dateToInt(moment());
            multi.hset(key, 'date', now.toString());
            multi.zadd(dbkey('posts'), now, key);
        }

        multi.exec(function() {
            // Make sure it persists to the disk after everything is saved
            client.save();
        });
    });

    res.redirect('/' + shorturl);
});

app.get('/email-changes', function(req, res) {
    res.render('email-changes.html');
});

app.post('/email-changes', loggedIn, function(req, res) {
    // TODO: this was quickly rewritten and will be refactored/commented
    var shorturl = req.body.shorturl;
    var content = req.body.content;

    res.send('ok');

    var file1 = path.join(settings.tmpdir, tmpFile());
    var file2 = path.join(settings.tmpdir, tmpFile());

    getPost(dbkey('post', shorturl), function(post) {
        fs.writeFile(file1, post.content, 'utf-8', writeOther);
    });

    function writeOther(err) {
        if(!err) {
            fs.writeFile(file2, content, 'utf-8', emailDiff);
        }
    }

    function emailDiff(err) {
        if(!err) {
            var output = '';
            var errOutput = '';
            var error = null;
            var diff = spawn('diff', ['-w', file1, file2]);

            diff.stdout.on('data', function(data) {
                output += data;
            });

            diff.stdout.on('close', function() {
                if(output && ADMINS.length) {
                    var server = email.server.connect({
                        user: settings.emailUser,
                        password: settings.emailPass,
                        host: settings.emailHost,
                        ssl: settings.emailSsl
                    });

                    var text = ('FROM: ' + req.session.user.email + '\n\n' +
                                'PATCH: \n' + output);

                    server.send({
                        text: text,
                        from: 'nobody@example.com',
                        to: ADMINS[0],
                        subject: 'submitted patch'
                    }, function(err, msg) {
                        if(err) {
                            throw err;
                        }
                    });
                }
            });
        }
    }
});

app.post('/markdown', function(req, res) {
    res.send(ghm.parse(req.body.doc));
});

app.listen(settings.port);
