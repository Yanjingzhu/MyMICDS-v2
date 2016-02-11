var http = require('http');
var https = require('https');

/* SSL */

/*
var credentials =
{
    key: fs.readFileSync('sslcert/server.key', 'utf8'),
    cert: fs.readFileSync('sslcert/server.crt', 'utf8'),
};
*/

/* Express */

var express = require('express');
var app = express();
var server = http.Server(app);

var io = require('socket.io')(server);

/* General Libraries */
var ejs = require('ejs');

/* Session */

/* 
 * IMPORTANT: Do not use the default MemoryStore session store. It is not designed for a production environment.
 * If you do use the default store then you should pass the same session instance to express and socket app (data are saved in memory).
 * https://www.npmjs.com/package/connect-mongo
 */

//var ios = require('socket.io-express-session');
// TODO: Configure express session (https://github.com/expressjs/session#sessionoptions)
var session = require('express-session')({
    secret: "130416",
    resave: false,
    saveUninitialized: false,
});

io.use(function(socket, next) {
    session(socket.request, socket.request.res, next);
});

app.use(session);

app.set('view engine', 'ejs');

var port = 420;
server.listen(port, function() {
    console.log('Server listening on *:' + port);
});

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/html/index.html');
});

app.get('/login', function(req, res) {
	req.session.user = 'mgira';
    res.end('Logged in');
});

app.get('/username', function(req, res) {
    res.end(req.session.user);
});

io.on('connection', function(socket){
    
    socket.emit('username', socket.request.session.user);
    
	console.log('user connected');
	console.log(socket.request.session);
	
	socket.on('changeUsername', function(username) {
		socket.request.session.user = username;
        socket.emit('username', socket.request.session.user);
	});
    
    socket.on('username', function() {
        socket.emit('username', socket.request.session.user);
    });
	
	socket.on('disconnect', function() {
		console.log('user disconnected');
	});
});