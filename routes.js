var _ = require('underscore');
var email = require('emailjs/email');
var spawn = require('child_process').spawn;
var path = require('path');
var fs = require('fs');
var moment = require('moment');

var settings = require('./settings');
var spoofUrls = require('./spoofedRoutes');
var db = require('./db');
var ghm = require('./showdown-ghm');
var u = require('./util');

// Install a scheme mode
var hljs = require('highlight.js');
hljs.LANGUAGES['scheme'] = require('./scheme.js')(hljs);


// Middleware

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

module.exports = function(app, env) {

    // Authentication
    require('express-persona')(app, {
        audience: settings.url,

        verifyResponse: function(err, req, res, email) {
            if(err) {
                res.json({ status: "failure", reason: err });
            }
            else {
                db.getUser(email, function(err, user) {
                    if(user) {
                        req.session.user = user;
                        res.json({ status: "okay", email: email });
                    }
                    else {
                        user = { email: email,
                                 admin: (settings.admins &&
                                         settings.admins.indexOf(email) !== -1) };

                        db.saveUser(user, function() {
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

    app.get('/', function(req, res, next) {
        db.getAllPosts(function(err, posts) {
            if(!u.handleError(err, next)) {
                res.render('index.html', { posts: posts.slice(0, 5),
                                           bodyId: 'home' });
            }
        });
    });

    app.get('/drafts', requireAdmin, function(req, res, next) {
        db.getAllPosts(true, function(err, posts) {
            if(!u.handleError(err, next)) {
                posts = _.filter(posts, function(p) { return p.published == 'n'; });
                res.render('drafts.html', { posts: posts });
            }
        });
    });

    app.get('/archive', function(req, res, next) {
        db.getAllPosts(function(err, posts) {
            if(!u.handleError(err)) {
                res.render('archive.html', { posts: posts });
            }
        });
    });

    app.get('/new', requireAdmin, function(req, res) {
        res.render('editor.html', { availableDates: u.previousDates() });
    });

    app.get('/edit/:post', function(req, res, next) {
        if(req.session.user || req.query.redirected) {
            db.getPost(db.dbkey('post', req.params.post), function(err, obj) {
                if(!u.handleError(err, next)) {
                    res.render('editor.html', { post: obj,
                                                availableDates: u.previousDates() });
                }
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

        db.getPost(db.dbkey('post', url), function(err, obj) {
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
                    db.getPost(db.dbkey('post', lookup[url]), function(err, obj) {
                        if(obj) {
                            renderPost(obj);
                        }
                        else {
                            u.handleError(err, next);
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
        db.getAllPostsByTag(req.params.tag, function(err, posts) {
            if(!u.handleError(err)) {
                res.render('tag.html', { tag: req.params.tag,
                                         posts: posts });
            }
        });
    });

    app.get('/freshman', function(req, res) {
        res.render('freshman.html');
    });

    app.get('/atom.xml', function(req, res, next) {
        db.getAllPosts(function(err, posts) {
            if(!u.handleError(err, next)) {
                db.client.get(db.dbkey('lastUpdate'), function(err, updated) {
                    posts = posts.slice(0, 5);
                    res.render('atom.xml', { posts: posts,
                                             base: u.rootUrl(req, settings.port),
                                             author: settings.author || '',
                                             updated: updated });
                });
            }
        });
    });

    app.post('/delete/:post', requireAdmin, function(req, res) {
        var key = db.dbkey('post', req.params.post);

        db.client.zrem(db.dbkey('posts'), key);

        db.getAllTags(function(err, tags) {
            tags.forEach(function(tag) {
                db.client.zrem(db.dbkey('tag', tag), key);
            });
        });

        res.send('ok');
    });

    app.post('/save', requireAdmin, function(req, res, next) {
        var content = req.body.content;
        var title = req.body.title;
        var published = req.body.published ? 'y' : 'n';
        var shorturl = u.slugify(req.body.shorturl || title);
        var date = moment(req.body.date, 'YYYYMMDD');
        var dateInt = u.dateToInt(date);
        var nowInt = u.dateToInt(moment());

        var tags = _.map(req.body.tags.split(','),
                         function(tag) {
                             return tag.replace(/^\s*|\s*$/g, '');
                         });
        if(!title) {
            title = ('Draft ' + u.formatDate(moment()));
            published = false;
        }

        var key = db.dbkey('post', shorturl);
        var oldKey = db.dbkey('post', req.body.prevShorturl);

        function renameAndFetch(cb) {
            db.getPost(oldKey, function(err, obj) {
                if(obj && key != oldKey) {
                    db.renamePost(obj, key, function(err) {
                        cb(err, obj);
                    });
                }
                else {
                    cb(err, obj);
                }
            });
        }

        renameAndFetch(function(err, obj) {
            var multi = db.client.multi();

            if(obj && oldKey == '') {
                // User is creating a new page with the same name as
                // another one
                console.error('Attempted to create new page with same ' +
                              'name as existing: ' + obj.shorturl);
                return;
            }
            else if(u.handleError(err)) {
                return;
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
                multi.zadd(db.dbkey('posts'), dateInt, key);

                if(obj.content != content) {
                    multi.hset(key,
                               'updatedDate',
                               u.dateToInt(moment()).toString());
                }

                // Removed from these tags
                _.difference(prevTags, tags).forEach(function(tag) {
                    multi.zrem(db.dbkey('tag', tag), key);
                });

                // Added these tags
                _.difference(tags, prevTags).forEach(function(tag) {
                    multi.zadd(db.dbkey('tag', tag), obj.date, key);
                });
            }

            // The post either didn't exist or wasn't published, and
            // should be
            else if(published == 'y') {
                multi.hset(key, 'date', dateInt.toString());
                multi.zadd(db.dbkey('posts'), dateInt, key);

                tags.forEach(function(tag) {
                    multi.zadd(db.dbkey('tag', tag), dateInt, key);
                });
            }

            // Otherwise, just make it a draft
            else {
                // If previously published, remove certain fields
                if(obj && obj.published == 'y') {
                    multi.hdel(key, 'updatedDate');

                    obj.tags.forEach(function(tag) {
                        multi.zrem(db.dbkey('tag', tag), key);
                    });
                }

                multi.hset(key, 'date', nowInt.toString());
                multi.zadd(db.dbkey('posts'), nowInt, key);
            }

            multi.set(db.dbkey('lastUpdate'), nowInt.toString());

            multi.exec(function(err) {
                if(!u.handleError(err, next)) {
                    // Make sure it persists to the disk after everything is saved
                    db.client.save();
                    res.redirect('/' + shorturl);
                }
            });
        });

    });

    app.get('/email-changes', function(req, res) {
        res.render('email-changes.html');
    });

    app.post('/email-changes', loggedIn, function(req, res, next) {
        // TODO: this was quickly rewritten and will be refactored/commented
        var shorturl = req.body.shorturl;
        var content = req.body.content;

        var file1 = path.join(settings.tmpdir, u.tmpFile());
        var file2 = path.join(settings.tmpdir, u.tmpFile());

        db.getPost(db.dbkey('post', shorturl), function(err, post) {
            if(!u.handleError(err, next)) {
                fs.writeFile(file1, post.content, 'utf-8', writeOther);
            }
        });

        function writeOther(err) {
            if(!u.handleError(err, next)) {
                fs.writeFile(file2, content, 'utf-8', emailDiff);
            }
        }

        function emailDiff(err) {
            if(!u.handleError(err, next)) {
                var output = '';
                var errOutput = '';
                var error = null;
                var diff = spawn('diff', ['-w', file1, file2]);

                diff.stdout.on('data', function(data) {
                    output += data;
                });

                diff.stdout.on('close', function() {
                    if(output &&
                       settings.admins &&
                       settings.admins.length) {
                        var server = email.server.connect({
                            user: settings.emailUser,
                            password: settings.emailPass,
                            host: settings.emailHost,
                            ssl: settings.emailSsl
                        });

                        var text = ('FROM: ' + req.session.user.email + '\n\n' +
                                    'PATCH: \n' + output);

                        settings.admins.forEach(function(to) {
                            server.send({
                                text: text,
                                from: settings.emailUser,
                                to: to,
                                subject: settings.emailSubject
                            }, function(err, msg) {
                                u.handleError(err);
                            });
                        });

                        res.send('ok');
                    }
                });
            }
        }
    });

    app.post('/markdown', function(req, res) {
        res.send(ghm.parse(req.body.doc));
    });
};