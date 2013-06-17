#!/usr/bin/nodejs

var io = require('socket.io').listen(8080);
var json_rpc_id = 0; // Variable pour l'ID des requètes en JSONRPC

//////////////////////////////////////////////////////////////////////

function Session()
{
	this.data = {};
}

Session.prototype.set = function (name, value) {
	this.data[name] = value;
}

Session.prototype.get = function (name, default) {
	if (this.data[name])
	{
		return this.data[name];
	}

	return default; // @todo Check it works.
}

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
}

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
}

var response = new Response(function (data) { socket.emit(data); }, 3);

///////////////////////////////////////

var users = {
	'0': {
		'name': 'chris.allard',
		'password': '123',
	},
};

///////////////////////////////////////

var api = {};

api.session = {
	'signInWithPassword': function (session, req, res)
	{
		var p_user = req.params.user;
		var p_pass = req.params.password;

		if (!p_user || !p_pass)
		{
			res.sendError(-32602, 'invalid params');
			return;
		}

		var user = _.findWhere(users, {'name': p_user});
		if (!user)
		{
			// @todo Nonexistent user: returns an error.
			return;
		}

		// @todo
		// If check password:
		//   register session
		// else
		//   return an error.
	},
};

///////////////////////////////////////

io.socket.on('connexion', function (socket) {
	sockect.on('message', function (message) {

		// @todo Handle invalid JSON.
		message = JSON.parse(message.toString());

		// @tooo Handle invalid JSON-RPC.

		// @todo Where should we create the session object which have
		// to exist during the whole connection?
		var session = new Session();

		var req = {
			'method': message.method,
			'params': message.params
		};
		var res = new Reponse(
			function (data) {
				socket.emit(data);
			},
			message.id
		);

		// @todo Put the resolving algorithm in a function which
		// returns the function if found, “undefined” otherwise.

		var parts = message.method.split('.');

		var current = api;
		for (var i = 0; i < parts.length; ++i)
		{
			if (!current[parts[i]])
			{
				res.sendError(-32601, 'No such method');
				console.error('No such method: ' + message.method);
				return;
			}

			current = current[parts[i]];
		}

		if (!_.isFunction(current))
		{
			res.sendError(-32601, 'No such method');
			console.error('No such method: ' + message.method);
			return;
		}

		current(session, req, res);
	});
});
