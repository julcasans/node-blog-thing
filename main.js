var express = require('express');
var nunjucks = require('nunjucks');
var redis = require('redis');
var redisStore = require('connect-redis')(express);
var ghm = require('github-flavored-markdown');
var moment = require('moment');
var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;
var email = require('emailjs/email');

var settings = require('./settings');

var ADMINS = ['longster@gmail.com'];

// Util

function formatDate(date, format) {
    if(!(date instanceof Date)) {
        date = new Date(parseInt(date) || null);
    }
    format = format || 'MMMM Do YYYY';

    return moment(date).format(format);
}

function previousDates() {
    var current = moment();
    var end = moment().subtract('years', 1);
    var dates = [];

    while(current > end) {
        dates.push(current.valueOf());
        current = current.subtract('days', 1);
    }

    return dates;
}

function tmpFile() {
    // TODO: use a proper tmp file lib
    return 'blogthing-' + Math.floor(Math.random()*10000) + Date.now();
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

function getAllPosts(type, cb) {
    if(_.isFunction(type)) {
        cb = type;
        type = 'posts';
    }

    client.zrevrange(dbkey(type), 0, -1, function(err, keys) {
        getAllPostsByKeys(keys, cb);
    });
}

function getPost(key, cb) {
    client.hgetall(key, function(err, obj) {
        if(obj) {
            obj.tags = (obj.tags && obj.tags.split(',')) || [];
        }

        cb(obj);
    });
}

function getAllPostsByKeys(keys, cb) {
    var posts = [];

    if(keys.length) {
        keys.forEach(function(key) {
            getPost(key, function(obj) {
                posts.push(obj);

                if(posts.length == keys.length) {
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
    // If the updatedDate is more than a days old, yes
    return post.updatedDate &&
        post.updatedDate - post.date > 1000*60*60*24;
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
                    // This runs *after* the auth middleware runs, so
                    // need to set this here or the first page view
                    // won't have a user set
                    res.locals.user = user;
                    res.json({ status: "okay", email: email });
                }
                else {
                    user = { email: email,
                             admin: ADMINS.indexOf(email) !== -1 };

                    saveUser(user, function() {
                        req.session.user = user;
                        // Same here, see comment above
                        res.locals.user = user;
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
    getAllPosts('drafts', function(posts) {
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

app.get('/:post', function(req, res, next) {
    getPost(dbkey('post', req.params.post), function(obj) {
        if(obj) {
            obj.rendered = ghm.parse(obj.content);
            res.render('post.html', { post: obj,
                                      bodyId: obj.shorturl,
                                      bodyClass: 'post' });
        }
        else {
            next();
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
    client.zrem(dbkey('drafts'), key);

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
    var shorturl = req.body.shorturl || title.replace(' ', '-');
    var date = parseInt(req.body.date);
    var tags = _.map(req.body.tags.split(','),
                     function(tag) {
                         return tag.replace(/^\s*|\s*$/g, '');
                     });

    if(!title) {
        title = ('Draft ' + formatDate(new Date()));
        published = false;
    }

    var key = dbkey('post', shorturl);

    client.hgetall(key, function(err, obj) {
        client.hmset(key, { shorturl: shorturl,
                            content: content,
                            title: title,
                            published: published,
                            tags: tags.join(',') });

        // The post already exists and is published
        if(published == 'y' && obj && obj.published == 'y') {
            var prevTags = obj.tags.split(',');
            client.hset(key, 'date', date.toString());
            client.hset(key, 'updatedDate', Date.now().toString());

            // Removed from these tags
            _.difference(prevTags, tags).forEach(function(tag) {
                client.zrem(dbkey('tag', tag), key);
            });

            // Added these tags
            _.difference(tags, prevTags).forEach(function(tag) {
                client.zadd(dbkey('tag', tag), obj.date, key);
            });
        }

        // The post either didn't exist or wasn't published, and
        // should be
        else if(published == 'y') {
            client.hset(key, 'date', date.toString());
            client.zadd(dbkey('posts'), date, key);
            client.zrem(dbkey('drafts'), key);

            tags.forEach(function(tag) {
                client.zadd(dbkey('tag', tag), date, key);
            });
        }

        // Otherwise, just make it a draft
        else {
            // If previously published, remove certain fields
            if(obj && obj.published == 'y') {
                client.hdel(key, 'updatedDate');
                client.zrem(dbkey('posts'), key);

                obj.tags.split(',').forEach(function(tag) {
                    client.zrem(dbkey('tag', tag), key);
                });
            }

            var now = Date.now();
            client.hset(key, 'date', now.toString());
            client.zadd(dbkey('drafts'),
                        now,
                        key);
        }
    });

    res.redirect('/');
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
