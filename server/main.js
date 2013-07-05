#!/usr/bin/nodejs

var io = require('socket.io').listen(8080, {'log level': 0});
var _ = require('underscore');
var crypto = require('crypto');
var hashy = require('hashy');
var events = require('events');
var util = require('util');
var http = require('https');
var xmlrpc = require('xmlrpc');


var users_nb_id = 0;

Array.prototype.unset = function(val) {
	var index = this.indexOf(val)
	if(index > -1){
		this.splice(index,1)
	}
};

//////////////////////////////////////////////////////////////////////

function isEmail(email)
{
	var regEmail = new RegExp('^[0-9a-z._-]+@{1}[0-9a-z.-]{2,}[.]{1}[a-z]{2,5}$','i');
	return regEmail.test(email);
}

function isPassword(password)
{
	var regPassword = new RegExp('^[0-9a-zA-Z].{5,}$','i');
	return regPassword.test(password);
}

var droits = ['none', 'read', 'write', 'admin'];

//////////////////////////////////////////////////////////////////////

function Collection()
{
	this.data = {};
	this.eventListeners = {};
}

Collection.prototype.add = function(obj) {
	this.data[obj.ref] = obj;
	this.emit('add', obj);


};

Collection.prototype.remove = function(id) {
	var obj = this.data[id];

	if (undefined === obj)
	{
		return false;
	}

	delete this.data[id];

	this.emit('remove', obj);
	return true;
};

Collection.prototype.reset = function () {
	this.data = {};

	this.emit('reset');
};

Collection.prototype.get = function (id, def) {
	if (undefined !== this.data[id])
	{
		return this.data[id];
	}

	return def;
};

Collection.prototype.set = function (id, params) {
	for (var parameter in params)
	{
		this.data[id][parameter] = params[parameter];
	}

};

Collection.prototype.findWhere = function (properties) {
	return _.findWhere(this.data, properties);
};

Collection.prototype.on = function (event, callback) {
	if (undefined === this.eventListeners[event])
	{
		this.eventListeners[event] = [];
	}

	this.eventListeners[event].push(callback);
};

Collection.prototype.off = function (event, callback) {
	if (undefined === this.eventListeners[event])
	{
		return;
	}

	this.eventListeners[event].unset(callback);

	if (null === this.eventListeners[event])
	{
		delete this.eventListeners[event];
	}
}          

Collection.prototype.once = function (event, callback) {
	var once = function () {
		this.off(event, once);
		callback.apply(this, arguments);
	};
	return this.on(event, once);
}

Collection.prototype.emit = function (event) {
	if (undefined === this.eventListeners[event])
	{
		return;
	}

	var args = Array.prototype.slice.call(arguments, 1);
	var self = this;

	_.each(this.eventListeners[event], function (val) {
		val.apply(self, args);
	});
};

//////////////////////////////////////////////////////////////////////

function Session()
{
	this.data = {};
}

util.inherits(Session, events.EventEmitter);

Session.prototype.set = function (name, value) {
	this.data[name] = value;
};

Session.prototype.get = function (name, def) {
	if (undefined !== this.data[name])
	{
		return this.data[name];
	}

	return def;
};

Session.prototype.has = function (name) {
	return (undefined !== this.data[name]);
};


Session.prototype.close = function () {
 	this.emit('close');
};

//////////////////////////////////////////////////////////////////////

// @todo Prints an error if we call sendError() and/or sendResult()
// more than once.

function Response(transport, id)
{
	this.transport = transport;
	this.id = id;
}

Response.prototype.sendResult = function (value)
{
	this.transport.send(JSON.stringify({
		'jsonrpc': '2.0',
		'result': value,
		'id': this.id,
	}));
};

Response.prototype.sendError = function (code, message)
{
	this.transport.send(JSON.stringify({
		'jsonrpc': '2.0',
		'error': {
			'code': code,
			'message': message,
		},
		'id': this.id,
	}));
};

///////////////////////////////////////

var users = new Collection();
users.add({
	'id': users_nb_id++,
	'email': 'dupont@gmail.com',
	'password': '$2a$10$PsSOXflmnNMEOd0I5ohJQ.cLty0R29koYydD0FBKO9Rb7.jvCelZq',
	'permission': 'admin',
});

///////////////////////////////////////

var tokens = new Collection();

///////////////////////////////////////

var api = {};

api.session = {

	///////////////////////////////////////

	'signInWithPassword': function (session, req, res)
	{
		var p_email = req.params.email;
		var p_pass = req.params.password;

		if (!p_email || !p_pass)
		{
			res.sendError(-32602, 'invalid params');
			return;
		}

		if (session.has('user_id'))
		{
			res.sendError(0, 'already authenticated');
			return;
		}

		var user = users.findWhere({'email': p_email});
		if (!user)
		{
			res.sendError(1, 'invalid credential');
			return;
		}

		hashy.verify(p_pass, user.password)
			.then(function (success) {
				if (!success)
				{
					res.sendError(1, 'invalid credential')
					return;
				}

				session.set('user_id', user.id);
				session.set('authentication_method', 'password');
				res.sendResult(true);

				console.log('the password has been checked, you are now authenticated!');

				if (hashy.needsRehash(user.password))
				{
					return hashy.hash(p_pass).then(function (new_hash) {
						user.password = new_hash;
						console.log('the hash has been updated:', user.password);
					});
				}
			})
			.done();

		var cb = function () {
			session.close();
		};
		users.once('deleteUser:'+ user.id, cb);

		session.on('close', function () {
			users.off('deleteUser:'+ user.id, cb);
		});

	},

	///////////////////////////////////////

	'getUser': function (session, req, res)
	{
		var user_id = session.get('user_id');

		if (undefined === user_id)
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		var user = users.get(user_id);

		res.sendResult(_.omit(user, 'password'));
	},

	///////////////////////////////////////

	'signInWithToken': function (session, req, res)
	{
		var p_token = req.params.token;

		if (!p_token)
		{
			res.sendError(-32602, 'invalid params');
			return;
		}

		if (session.has('user_id'))
		{
			res.sendError(0, 'already authenticated');
			return;
		}

		var token = tokens.get(p_token);
		if (!token)
		{
			res.sendError(1, 'invalid token');
			return;
		}

		session.set('user_id', token.user_id);
		session.set('authentication_method', 'token');

		var cb = function () {
			session.close();
		};
		tokens.once('deleteToken:'+ p_token, cb);

		session.on('close', function () {
			tokens.off('deleteToken:'+ p_token, cb);
		});

		res.sendResult(true);
	},

	///////////////////////////////////////

	'createToken': function (session, req, res)
	{
		var user_id = session.get('user_id');

		if (undefined === user_id)
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		if ('token' === session.get('authentication_method'))
		{
			res.sendError(0, 'Can\'t create token when authenticated with token');
			return;
		}

		crypto.randomBytes(32, function(ex, value) {
			var token = value.toString('base64');
			tokens.add({
				'id': token,
				'user_id': user_id,
			});
			res.sendResult(token);
		});
	},

	///////////////////////////////////////

	'destroyToken': function (session, req, res)
	{
		var p_token = req.params.token;

		if (!tokens.remove(p_token))
		{
			res.sendError(0, 'invalid token');
			return;
		}

		tokens.emit('deleteToken:'+p_token);
		res.sendResult(true);
	},

};

///////////////////////////////////////
api.user = {

	///////////////////////////////////////

	'create': function (session, req, res)
	{
		var p_email = req.params.email;
		var p_password = req.params.password;
		var p_permission = req.params.permission;

		var user_id = session.get('user_id');

		if (!session.has('user_id'))
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		if ('admin' !== users.get(user_id).permission)
		{
			res.sendError(3, 'not authorized');
			return;
		}

		if (!isEmail(p_email))
		{
			res.sendError(1, 'invalid user email');
			return;
		}	

		if (!isPassword(p_password))
		{
			res.sendError(2, 'invalid user password');
			return;
		}

		if (!_.contains(droits, p_permission))
		{
			res.sendError(0, 'invalid permission');
			return;
		}

		if (undefined !== users.findWhere(p_email))
		{
			res.sendError(4, 'user name already taken');
			return;
		}
		hashy.hash(p_password)
			.then(function (hash) {
				console.log('generated hash: ', hash);

				res.sendResult(users_nb_id);
				users.add({
					'id': users_nb_id++,
					'email': p_email,
					'password': hash,
					'permission': p_permission,
				});

			})
			.fail(function (err) {
				console.error(err);
			})
			.done();

	},

	///////////////////////////////////////

	'delete': function (session, req, res)
	{
		var p_id = req.params.id
		var user_id = session.get('user_id');

		if (!session.has('user_id'))
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		if ('admin' !== users.get(user_id).permission)
		{
			res.sendError(0, 'not authorized');	
			return;
		}

		if (!users.remove(p_id))
		{
			res.sendError(1, 'invalid user');
			return;
		}

		users.emit('deleteUser:'+ p_id);
		res.sendResult(true);

	},

	///////////////////////////////////////

	'changePassword': function (session, req, res)
	{
		var p_oldPassword = req.params.old;
		var p_newPassword = req.params['new'];

		if (!session.has('user_id'))
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		var user_id = session.get('user_id');
		var user = users.get(user_id);

		hashy.verify(p_oldPassword, user.password)
			.then(function (success) {
				if (!success)
				{
					res.sendError(1, 'invalid credential')
					return;
				}

				if (!isPassword(p_newPassword))
				{
					res.sendError(2, 'invalid password');
					return;
				}
			
				users.set(user_id, {
					'password': p_newPassword,
				});

				res.sendResult(true);
			})
		.done();
	},

	///////////////////////////////////////

	'getAll': function (session, req, res)
	{
		var user_id = session.get('user_id');

		if ('admin' !== users.get(user_id).permission)
		{
			res.sendError(0, 'not authorized');
			return;
		}

		res.sendResult(users.get(user_id));
	},

	///////////////////////////////////////

	'set': function (session, req, res)
	{
		if (!session.has('user_id'))
		{
			res.sendError(0, 'not authenticated');
			return;
		}
	
		var user_id = req.params.id;
		
		if (undefined === users.get(user_id))
		{
			res.sendError(1, 'invalid user');
			return;
		}

		if (_.isUndefined(_.omit(req.params, ['id','email','password','permission'])))
		{
			res.sendError(2, 'invalid property');
			return;
		}

		var user = users.get(user_id);
		var p_email = user.email;
		var p_password = user.password;
		var p_permission = user.permission;


		if (undefined !== req.params.email)
		{
			p_email = req.params.email;
		}

		if (undefined !== req.params.password)
		{
			hashy.hash(req.params.password)
			.then(function (hash) {
				console.log('generated hash: ', hash);

				p_password = hash;

				if (undefined !== req.params.permission)
				{
					p_permission = req.params.permission;
				}

				if (!isEmail(p_email))
				{
					res.sendError(1, 'invalid user email');
					return;
				}	

				if (isPassword(p_password))
				{
					res.sendError(2, 'invalid user password');
					return;
				}

				if (!_.contains(droits, p_permission))
				{
					res.sendError(0, 'invalid permission');
					return;
				}

				users.set(user_id, {
							'email': p_email,
							'password': p_password,
							'permission': p_permission,
						});

				res.sendResult(true);
			})
			.fail(function (err) {
				console.error(err);
			})
			.done();

		}
	},
};

//////////////////////////////////////////////////////////////////////

function xapi_call(host, method, params, callback)
{
	var options = {
		hostname: host,
		port: '443',
		rejectUnauthorized : false,
	};

	xmlrpc.createSecureClient(options).methodCall(method, params, function (error, value) {
		if (error)
		{
			console.error(error);
			process.exit(1);
		}

		if ('Success' !== value.Status)
		{
			console.error(value);
			process.exit(1);
		}

		callback(value.Value);
	});
}

///////////////////////////////////////

function Xapi(host, session)
{
	this.host = host;
	this.session = session;
}

Xapi.prototype.call_ = function(method, callback)
{
	var params = [];

	var n = arguments.length;
	if (n > 2)
	{
		params = Array.prototype.slice.call(arguments, 1, n - 1);
		callback = arguments[n - 1];
	}

	params.unshift(this.session);

	xapi_call(this.host, method, params, function(value) {
		callback(value);
	});
}

// Static method = class method.
Xapi.open = function(host, username, password, callback) {
	xapi_call(host, 'session.login_with_password', [username, password], function(value) {
		callback(new Xapi(host, value));
	});
};

//////////////////////////////////////////////////////////////////////

function api_resolve(name)
{
	var parts = name.split('.');

	var current = api;

	for (var i = 0; i < parts.length; ++i)
	{
		if (!current[parts[i]])
		{
			return undefined;
		}

		current = current[parts[i]];
	}

	if (!_.isFunction(current))
	{
		return undefined;
	}

	return current;
};

///////////////////////////////////////

io.sockets.on('connection', function (socket) {

	Xapi.open('192.168.1.116', 'root', 'qwerty', function(xapi) {

	var wait_and_log_event = function() {
		//
		xapi.call_('event.next', function(event) {
			console.log(event);

			wait_and_log_event();
		});
	}

	//
	xapi.call_('event.register', ['*'], wait_and_log_event);
	});

	var session = new Session();
	
	session.on('close', function () {
		socket.disconnect();
	});

	var transport = {
		'send': function (data) {
			console.log(data);
			socket.send(data);
		},
	};

	socket.on('message', function (message) {
		console.log(message);
		try
		{
			message = JSON.parse(message.toString());
		}
		catch (exception)
		{
			new Response(transport, null).sendError(-32700,'invalid JSON was received');
			return;
		}

		if (message.jsonrpc !== '2.0' || !message.method || !message.params || message.id === undefined)
		{
			new Response(transport, null).sendError(-32600, 'The JSON sent is not a valid request object');
			return;
		}

		var req = {
			'method': message.method,
			'params': message.params
		};
		var res = new Response(transport, message.id);

		var current = api_resolve(message.method);
		console.log(current);
		if (!current)
		{
			res.sendError(-32601, 'No such method');
			return;
		}

		current(session, req, res);
	});
});
