#!/usr/bin/nodejs

var io = require('socket.io').listen(8080);

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
	if (this.data[name])
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
		'password': '123'
	},
];


///////////////////////////////////////

var random = function() {
    return (Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2));
};

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
		var user = _.findWhere(users, {'email': p_email});

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

		if (!user)
		// verifie si l'utilisateur existe dans la base du serveur.
		{
			res.sendError(1, 'invalid credential')
			return;
		}

		if (p_pass !== users.password)
		// Verifie si l'utilisteur à le bon mot de passe.
		{
			res.sendError(1, 'invalid credential');
			return;
		}

		// L'utilisateur peut s'identifier on retourne True.
		session.set('user_id', user.id);
		res.sendResult(true);
	},

	///////////////////////////////////////

	'getUser': function (session, res)
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

		res.sendResult(user);
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

	'createToken': function (session, res)
	// Creates a token wich may be used to authenticate the user without its password during one week.
	{
		var user_id = session.get('user_id');

		if (user_id === undefined)
		// Vérifie si l'utilisateur n'est pas déjà enregistré.
		{
			res.sendError(0, 'not authenticated');
			return;
		}

		var token = random();

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

io.sockets.on('connexion', function (socket) {

	var session = new Session();

	var transport = function (data) {
		socket.send(data);
	};

	sockect.on('message', function (message) {

		// Test si l'on reçoit du JSON.
		try
		{
			message = JSON.parse(message.toString());
		}
		catch (exception)
		{
			new Response(transport, null).sendError(-32700,'invalid JSON was received');
		}

		// Test si l'on reçoit pas du JSON-RPC.
		if (!message.jsonrpc === '2.0' || !message.method || !message.params || !message.id)
		{
			new Response(transport, null).sendError(-32603, 'internal JSON-RPC error');
		}

		var req = {
			'method': message.method,
			'params': message.params
		};
		var res = new Response(transport, message.id);

		var current = api_resolve(message.method);

		if (!current)
		{
			// Si la fonction appelé n'existe pas.
			res.sendError(-32601, 'No such method');
			return;
		}

		current(session, req, res);
	});
});
