
module.exports = function(app) {
    //app.locals.dev = true;
    //app.enable('trust proxy');

    return {
        tmpdir: '/tmp',
        port: 4000,
        
        emailUser: '',
        emailPass: '',
        emailHost: '',
        emailSsl: true
    };
};