/**
 * @file Manages alias API endpoints
 */

const aliases = require(__dirname + '/../libs/aliases.js');
const api = require(__dirname + '/../libs/api.js');
const jwt = require(__dirname + '/../libs/jwt.js');

module.exports = (app, db, socketIO) => {

	app.post('/alias/add', jwt.requireLoggedIn, (req, res) => {
		aliases.add(db, req.user.user, req.body.type, req.body.classString, req.body.classId, (err, aliasId) => {
			if(!err) {
				socketIO.user(req.user.user, 'alias', 'add', {
					_id: aliasId,
					type: req.body.type,
					classNative: req.body.classId,
					classRemote: req.body.classString
				});
			}
			api.respond(res, err, { id: aliasId });
		});
	});

	app.post('/alias/list', jwt.requireLoggedIn, (req, res) => {
		aliases.list(db, req.user.user, (err, aliases) => {
			api.respond(res, err, { aliases });
		});
	});

	app.post('/alias/delete', jwt.requireLoggedIn, (req, res) => {
		aliases.delete(db, req.user.user, req.body.type, req.body.id, err => {
			if(!err) {
				socketIO.user(req.user.user, 'alias', 'delete', req.body.id);
			}
			api.respond(res, err);
		});
	});

};
