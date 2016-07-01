'use strict';

/**
 * @file Defines authorization-related functions.
 * @module auth
 */

var cookies     = require(__dirname + '/cookies.js');
var crypto      = require('crypto');
var cryptoUtils = require(__dirname + '/cryptoUtils.js');
var bcrypt      = require('bcrypt');
var mail        = require(__dirname + '/mail.js');
var users       = require(__dirname + '/users.js');

/**
 * Validates a user's credentials and updates the 'lastLogin' field.
 * @function login
 *
 * @param {Object} db - Database connection
 * @param {string} user - Username
 * @param {string} password - Plaintext password
 * @param {Boolean} generateCookie - Whether callback should return 'Remember Me' cookie as well
 * @param {loginCallback} callback - Callback
 */

/**
 * Callback after a user is logged in
 * @callback loginCallback
 *
 * @param {Object} err - Null if successful, error object if failure
 * @param {Boolean} response - True if credentials match in database, false if not. Null if error.
 *
 * @param {Object} cookie - Object containing information about cookie. Returned if login is successful and create cookie is successful, null in all other cases.
 * @param {string} cookie.selector - Selector to be placed in cookie.
 * @param {string} cookie.token - Token to be placed in cookie.
 * @param {Object} cookie.expires - Javascript date object of when cookie expires.
 */

function login(db, user, password, generateCookie, callback) {
	if(typeof callback !== 'function') return;

	if(typeof db !== 'object') {
		callback(new Error('Invalid database connection!'), null, null);
		return;
	}
	if(typeof password !== 'string') {
		callback(new Error('Invalid password!'), null, null);
		return;
	}
	if(typeof generateCookie !== 'boolean') {
		generateCookie = true;
	}

	passwordMatches(db, user, password, function(err, passwordMatches) {
		if(err) {
			callback(err, null, null);
			return;
		}
		if(!passwordMatches) {
			callback(null, false, null);
			return;
		}

		// Update lastLogin in database
		var userdata = db.collection('users');
		userdata.update({ user: user }, { $currentDate: { lastLogin: true }});

		// Login successful!
		// Create cookie if generateCookie is true
		if(generateCookie) {
			cookies.createCookie(db, user, function(err, cookie) {
				if(err) {
					callback(null, true, null);
					return;
				}

				callback(null, true, cookie);

			});
		} else {
			callback(null, true, null);
		}
	});
}

/**
 * Determines whether a password matches for a certain user
 * @function passwordMatches
 *
 * @param {Object} db - Database connection
 * @param {string} user - Username
 * @param {string} password - Plaintext password
 * @param {passwordMatchesCallback} callback - Callback
 */

/**
 * Returns whether password matches or not
 * @callback passwordMatchesCallback
 *
 * @param {Object} err - Null if successful, error object if failure.
 * @param {Boolean} matches - True if password matches, false if not. Null if error.
 */

function passwordMatches(db, user, password, callback) {
	if(typeof callback !== 'function') return;

	if(typeof db !== 'object') {
		callback(new Error('Invalid database connection!'), null);
		return;
	}
	if(typeof password !== 'string') {
		callback(new Error('Invalid password!'), null);
		return;
	}

	users.getUser(db, user, function(err, isUser, userDoc) {
		if(err) {
			callback(err, null);
			return;
		}
		if(!isUser) {
			callback(new Error('User doesn\'t exist!'), null);
			return;
		}

		var hash = userDoc['password'];

		bcrypt.compare(password, hash, function(err, res) {
			if(err) {
				callback(new Error('There was a problem comparing the passwords!'), null);
				return;
			}

			callback(null, res);

		});
	});
}

/**
 * Registers a user by adding their credentials into the database. Also sends email confirmation.
 * @function register
 *
 * @param {Object} db - Database connection
 *
 * @param {Object} user - User's credentials
 * @param {string} user.username - Username (___@micds.org)
 * @param {string} user.password - User's plaintext password
 * @param {string} user.firstName - User's first name
 * @param {string} user.lastName - User's last name
 * @param {Number} [user.gradYear] - User's graduation year (Ex. Class of 2019). DO NOT DEFINE IF USER IS A TEACHER!
 *
 * @param {registerCallback} callback - Callback
 */

/**
 * Callback after a user is registered
 * @callback registerCallback
 *
 * @param {Object} err - Null if success, error object if failure
 */

function register(db, user, callback) {

	// Validate inputs
	if(typeof callback !== 'function') callback = function() {};
	if(typeof db   !== 'object') { callback(new Error('Invalid database connection!')); return; }
	if(typeof user !== 'object') { callback(new Error('Invalid user object!'));         return; }
	if(typeof user.username !== 'string') {
		callback(new Error('Invalid username!'));
		return;
	} else {
		// Make sure username is lowercase
		user.username = user.username.toLowerCase();
	}

	if(typeof user.password  !== 'string') { callback(new Error('Invalid password!'));   return; }
	if(typeof user.firstName !== 'string') { callback(new Error('Invalid first name!')); return; }
	if(typeof user.lastName  !== 'string') { callback(new Error('Invalid last name!'));  return; }

	if(typeof user.gradYear === 'number' && user.gradYear % 1 === 0) {
		// Valid graduation year, make sure teacher is set to false
		user.teacher = false;
	} else {
		user.teacher = true;
	}

	// Check if it's an already existing user
	users.getUser(db, user.username, function(err, isUser, data) {
		if(isUser && data.confirmed) {
			callback(new Error('An account is already registered under the email ' + user.username + '@micds.org!'));
			return;
		}

		var userdata = db.collection('users');

		// Generate confirmation email hash
		crypto.randomBytes(16, function(err, buf) {
			if(err) {
				callback(new Error('There was a problem generating a random confirmation hash!'));
				return;
			}

			var hash = buf.toString('hex');

			// Hash Password
			cryptoUtils.hashPassword(user.password, function(err, hashedPassword) {
				if(err) {
					callback(err);
					return;
				}

				var newUser = {
					user      : user.user,
					password  : hashedPassword,
					firstName : user.firstName,
					lastName  : user.lastName,
					gradYear  : user.gradYear,
					teacher   : user.teacher,
					confirmed : false,
					registered: new Date(),
					confirmationHash: hash,
				}

				userdata.update({ user: newUser.user }, newUser, { upsert: true }, function(err, data) {
					if(err) {
						callback(new Error('There was a problem inserting the account into the database!'));
						return;
					}

					var email = newUser.user + '@micds.org';
					var emailReplace = {
						firstName  : newUser.firstName,
						lastName   : newUser.lastName,
						confirmLink: 'https://mymicds.net/confirm/' + newUser.user + '/' + hash,
					}

					// Send confirmation email
					mail.sendHTML(email, 'Confirm your Account', __dirname + '/../html/messages/register.html', emailReplace, callback);
				});
			});
		});
	});
}

/**
 * Confirms a user's account if hash matches. This is used to confirm the user's email and account via email.
 * @function confirm
 *
 * @param {Object} db - Database connection
 * @param {string} user - Username
 * @param {string} hash - Hashed password from the database
 * @param {confirmCallback} callback - Callback
 */

/**
 * Callback after the account has is confirmed
 * @callback confirmCallback
 *
 * @param {Object} err - Null if successful, error object if failure
 */

function confirm(db, user, hash, callback) {

	if(typeof callback !== 'function') {
		callback = function() {};
	}

	if(typeof db !== 'object') {
		callback(new Error('Invalid database connection!'));
		return;
	}
	if(typeof user !== 'string') {
		callback(new Error('Invalid username!'));
		return;
	}
	if(typeof hash !== 'string') {
		callback(new Error('Invalid hash!'));
		return;
	}

	users.getUser(db, user, function(err, isUser, userDoc) {
		if(err) {
			callback(err);
			return;
		}
		if(!isUser) {
			callback(new Error('Does doesn\'t exist!'));
			return;
		}

		var dbHash = userDoc['confirmationHash'];

		if(cryptoUtils.safeCompare(hash, dbHash)) {
			// Hash matches, confirm account!
			userdata.update({ user: user }, {$set: { confirmed: true }}, function(err, results) {
				if(err) {
					callback(new Error('There was a problem updating the database!'));
					reutrn;
				}
				callback(null);
			});
		} else {
			// Hash does not match
			callback(new Error('Hash not valid!'));
		}
	});
}

module.exports.login           = login;
module.exports.passwordMatches = passwordMatches;
module.exports.register        = register;
module.exports.confirm         = confirm;
