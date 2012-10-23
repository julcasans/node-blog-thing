var redis = require('redis');
var _ = require('underscore');

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
            cb(err);
        }
        else {
            getAllPostsByKeys(keys, function(err, posts) {
                if(!includeDrafts) {
                    cb(err, posts && _.filter(posts, function(p) {
                        return p.published == 'y';
                    }));
                }
                else {
                    cb(err, posts);
                }
            });
        }
    });
}

function getPost(key, cb) {
    client.hgetall([key], function(err, obj) {
        if(obj) {
            obj.tags = (obj.tags && obj.tags.split(',')) || [];
        }

        cb(err, obj);
    });
}

function getAllPostsByKeys(keys, cb) {
    var posts = [];
    var count = 0;

    if(keys.length) {
        keys.forEach(function(key) {
            getPost(key, function(err, obj) {
                if(obj) {
                    posts.push(obj);
                }
                else if(err) {
                    handleError(err);
                }

                count++;

                if(count == keys.length) {
                    cb(null, posts);
                }
            });
        });
    }
    else {
        cb(null, posts);
    }
}

function getAllPostsByTag(tag, cb) {
    client.zrevrange(dbkey('tag', tag), 0, -1, function(err, keys) {
        if(err) {
            cb(err);
        }
        else {
            getAllPostsByKeys(keys, cb);
        }
    });
}

function getAllTags(cb) {
    client.keys(dbkey('tag', '*'), function(err, keys) {
        cb(err, keys && _.map(keys, function(key) {
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
        cb(err);
    });
}

function getUser(email, cb) {
    client.hgetall(dbkey('user', email), function(err, user) {
        if(user) {
            user.admin = user.admin == 'y';
        }
        cb(err, user);
    });
}

function saveUser(user, cb) {
    user.admin = user.admin ? 'y' : 'n';
    client.hmset(dbkey('user', user.email), user, cb);
}

module.exports = {
    client: client,
    dbkey: dbkey,
    dbSplitKey: dbSplitKey,
    getAllPosts: getAllPosts,
    getPost: getPost,
    getAllPostsByKeys: getAllPostsByKeys,
    getAllPostsByTag: getAllPostsByTag,
    getAllTags: getAllTags,
    renamePost: renamePost,
    getUser: getUser,
    saveUser: saveUser
};