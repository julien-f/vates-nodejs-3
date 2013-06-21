#!/usr/bin/nodejs

var io = require('socket.io').listen(8080);
var _ = require('underscore');
var crypto = require ('crypto');
var hashy = require ('hashy');

io.set('log level', 0);

//////////////////////////////////////////////////////////////////////

Array.prototype.unset = function(val){
	var index = this.indexOf(val)
	if(index > -1){
		this.splice(index,1)
	}
}

//////////////////////////////////////////////////////////////////////

function Session()
{
	this.data = {};
}

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

//////////////////////////////////////////////////////////////////////

function Response(transport, id)
{
	this.transport = transport;
	this.id = id;
}

Response.prototype.sendResult = function (value)
{
	this.transport(JSON.stringify({
		'jsonrpc': '2.0',
		'result': value,
		'id': this.id,
	}));
};

Response.prototype.sendError = function (code, message)
{
	this.transport(JSON.stringify({
		'jsonrpc': '2.0',
		'error': {
			'code': code,
			'message': message,
		},
		'id': this.id,
	}));
};

///////////////////////////////////////

// @todo Arrays are really basic, maybe we should take a look at
// [Backbone.collection](http://backbonejs.org/#Collection)?
var users = [
	{
		'id': 0,
		'email': 'dupont@gmail.com',
		'password': '$2a$10$PsSOXflmnNMEOd0I5ohJQ.cLty0R29koYydD0FBKO9Rb7.jvCelZq'
	},
];


///////////////////////////////////////

var tokens = [];

///////////////////////////////////////

var api = {};

api.session = {

	///////////////////////////////////////

	'signInWithPassword': function (session, req, res)
	//Authenticates the user for the current session using its name and password.
	{
		var p_email = req.params.email;
		var p_pass = req.params.password;

		if (!p_email || !p_pass)
		// Verifie si l'email et le mot de passe n'existe pas.
		{
			res.sendError(-32602, 'invalid params');
			return;
		}

		if (session.get('user_id') !== undefined)
		// Verifie si l'utilisateur n'est pas déjà enregistrer.
		{
			res.sendError(0, 'already authenticated');
			return;
		}

		var user = _.findWhere(users, {'email': p_email});
		if (!user)
		// verifie si l'utilisateur existe dans la base du serveur.
		{
			res.sendError(1, 'invalid credential')
			return;
		}

		hashy.verify(p_pass, user.password)
			.then(function (success) {
				if (!success)
				{
					res.sendError(1, 'invalid credential')
					return;
				}

				// L'utilisateur peut s'identifier on retourne True.
				session.set('user_id', user.id);
				res.sendResult(true);

				console.log('the password has been checked, you are now authenticated!');

				// Now we can check if the hash should be recomputed, i.e. if it
				// fits the current security policies (algorithm & options).
				if (hashy.needsRehash(user.password))
				{
					return hashy.hash(p_pass).then(function (new_hash) {
						user.password = new_hash;
						console.log('the hash has been updated:', user.password);
					});
				}
			})
			.done();
	},

	///////////////////////////////////////

	'getUser': function (session, req, res)
	// Returns the authenticated user for this session.
	{
		var user_id = session.get('user_id');

		if (user_id === undefined)
		// Verifie si l'utilisateur n'est pas déjà enregistré.
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		var user = _.findWhere(users, {'id': user_id});

		res.sendResult(_.omit(user, 'password'));
	},

	///////////////////////////////////////

	'signInWithToken': function (session, req, res)
	// Authenticates the user for the current session using a token.
	{
		var p_token = req.params.token;

		if (!p_token)
		// Verifie le token donné en paramètre n'existe pas.
		{
			res.sendError(-32602, 'invalid params');
			return;
		}

		if (session.get('user_id') !== undefined)
		// Verifie si l'utilisateur n'est pas déjà enregistré.
		{
			res.sendError(0, 'already authenticated');
			return;
		}

		var token = _.findWhere(tokens, {'token': p_token});
		if (!token)
		{
			res.sendError(1, 'invalid token');
			return;
		}

		// L'utilisateur peut s'identifier on retourne True.
		session.set('user_id', token.id);
		res.sendResult(true);
	},

	///////////////////////////////////////

	'createToken': function (session, req, res)
	// Creates a token wich may be used to authenticate the user without its password during one week.
	{
		var user_id = session.get('user_id');

		if (user_id === undefined)
		// Vérifie si l'utilisateur n'est pas déjà enregistré.
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		var token =	crypto.randomBytes(32).toString('base64');

		tokens.push(
			{
				'token': token,
				'id': user_id,
			}
		);

		res.sendResult(token);
	},

	///////////////////////////////////////

	'destroyToken': function (session, req, res)
	// Destroys the given token, it may no longer be used to open a session.
	{
		var p_token = req.params.token;
		var elem	= _.findWhere(tokens, {'token': p_token});

		if (!p_token ||  !elem)
		// Si le token donné n'est pas valide ou qu'il n'existe pas dans la base du serveur.
		{
			res.sendError(0, 'invalid token');
			return;
		}

		tokens.unset(elem);
		res.sendResult(true);
	},

};

///////////////////////////////////////

function api_resolve(name)
// Verifie si la fonction appelé existe et retourne cette fonction ou retourne undefined.
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

	var session = new Session();

	var transport = function (data) {
		console.log(data);
		socket.send(data);
	};

	socket.on('message', function (message) {
		console.log(message);
		// Test si l'on reçoit du JSON.
		try
		{
			message = JSON.parse(message.toString());
		}
		catch (exception)
		{
			new Response(transport, null).sendError(-32700,'invalid JSON was received');
			return;
		}

		// Test si l'on reçoit pas du JSON-RPC.
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
			// Si la fonction appelé n'existe pas.
			res.sendError(-32601, 'No such method');
			return;
		}

		current(session, req, res);
	});
});
