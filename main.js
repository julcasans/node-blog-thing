var express = require('express');
var nunjucks = require('nunjucks');
var redis = require('redis');
var ghm = require('github-flavored-markdown');
var _ = require('underscore');

// Util

function formatDate(date) {
    if(!(date instanceof Date)) {
        date = new Date(parseInt(date) || null);
    }
    
    return ((date.getMonth() + 1) + '/' +
            date.getDate() + '/' +
            date.getFullYear());
            // date.getHours() + '.' +
            // date.getMinutes() + '.' +
            // date.getSeconds());
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

function getAllPostsByKeys(keys, cb) {
    var posts = [];

    if(keys.length) {
        keys.forEach(function(post) {
            client.hgetall(post, function(err, obj) {
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

// App

var app = express();
app.use(express.static(__dirname + '/static'));
app.use(express.bodyParser());

var env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader('views')
);
env.express(app);

env.addFilter('formatdate', formatDate);

// Routes

app.get('/', function(req, res) {
    getAllPosts(function(posts) {
        getAllTags(function(tags) {
            res.render('index.html', { posts: posts.slice(0, 5),
                                       tags: tags});
        });
    });
});

app.get('/drafts', function(req, res) {
    getAllPosts('drafts', function(posts) {
        res.render('drafts.html', { posts: posts });
    });
});

app.get('/archive', function(req, res) {
    getAllPosts(function(posts) {
        res.render('archive.html', { posts: posts });
    });
});

app.get('/new', function(req, res) {
    res.render('new.html');
});

app.get('/edit/:post', function(req, res) {
    client.hgetall(dbkey('post', req.params.post), function(err, obj) {
        res.render('new.html', { post: obj });
    });
});

app.get('/:post', function(req, res, next) {
    client.hgetall(dbkey('post', req.params.post), function(err, obj) {
        if(obj) {
            obj.rendered = ghm.parse(obj.content);
            res.render('post.html', { post: obj,
                                      bodyId: obj.shorturl });
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

app.post('/new', function(req, res) {
    var content = req.body.content;
    var title = req.body.title;
    var published = req.body.published ? 'y' : 'n';
    var shorturl = title;
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
        var now = Date.now();

        // The post already exists and is published
        if(published == 'y' && obj && obj.published == 'y') {
            var prevTags = obj.tags.split(',');
            client.hset(key, 'updatedDate', now.toString());

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
            client.hset(key, 'date', now.toString());
            client.zadd(dbkey('posts'), now, key);
            client.zrem(dbkey('drafts'), key);

            tags.forEach(function(tag) {
                client.zadd(dbkey('tag', tag), now, key);
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

            client.hset(key, 'date', now.toString());
            client.zadd(dbkey('drafts'),
                        now,
                        key);
        }
    });

    res.redirect('/');
});

app.post('/markdown', function(req, res) {
    res.send(ghm.parse(req.body.doc));
});

app.listen(4000);
