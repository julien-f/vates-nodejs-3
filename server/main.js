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

//////////////////////////////////////////////////////////////////////


// function (session, req, res) {

// 	// Session object.
// 	// I need to store session-related variables.
// 	session.set('toto', value);
// 	session.get('toto', 'default');

// 	// Request object.
// 	req.method = 'session.signInWithPassword';
// 	req.params = {user: 'chris.allard', password: '123'};

// 	// Response object.
// 	res.sendResult(true);
// 	res.sendError(code, message);
// }


///////////////////////////////////////

function user(name, password, permission, id)
{
	this.name = name;
	this.password = password;
	this.permission = permission;
	this.id = id;
}

var users = {
	'0': {
		'name': 'chris.allard',
		'password': '123',
	},
};

var session = {
	// 'id': {
	// 	'user': null,
	// },
};

///////////////////////////////////////

var api = {};

api.session = {
	'signInWithPassword': function (params, res)
	{
		if (users.indexOf(data.params[0]) != -1) // L'utilisateur existe bien
		{
			if (users[password] === data.params[1]) // Il y a le bon mot de passe
			{
				res.sendError(code, message);

				res.sendResult(true);


				socket.emit(
					JSON.stringify( {
						'jsonrpc': '2.0',
						'result' : true,
						'id': params[2],
					});
				);
			}
		}
	},
};

///////////////////////////////////////

io.socket.on('connexion', function (socket) {
	sockect.on('message', function (message) {
		message = JSON.parse(message.toString());

		var session = _; // @todo;
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
