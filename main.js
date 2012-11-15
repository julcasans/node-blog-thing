var express = require('express');
var nunjucks = require('nunjucks');
var redisStore = require('connect-redis')(express);
var email = require('emailjs/email');

var db = require('./db');
var settings = require('./settings');

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

app.configure('dev', function() {
    app.locals.dev = true;
});

app.configure('prod', function() {
    app.enable('trust proxy');
});

var env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader('views')
);
env.express(app);

// Template Helpers

require('./helpers')(env);

// Routes

require('./routes')(app);

// Error Handler

app.configure('prod', function() {
    app.use(function(err, req, res, next) {
        var msg = err.stack;
        var admins = settings.admins;

        if(admins && admins.length) {
            var server = email.server.connect({
                user: settings.emailUser,
                password: settings.emailPass,
                host: settings.emailHost,
                ssl: settings.emailSsl
            });

            settings.admins.forEach(function(to) {
                server.send({
                    text: msg,
                    from: settings.emailUser,
                    to: to,
                    subject: settings.errorSubject
                });
            });
        }

        console.error(msg);
        res.render('500.html');
    });
});

// Fire up the server

console.log('Started server on ' + settings.port + '...');
app.listen(settings.port);
