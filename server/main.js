#!/usr/bin/nodejs

var io = require('socket.io').listen(8080);
var json_rpc_id = 0; // Variable pour l'ID des requètes en JSONRPC
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
		message.JSON.parse(message.toString());

		var parts = message.method.split('.');

		var current = api;
		for (var i = 0; i < parts.length; ++i)
		{
			if (!current[parts[i]])
			{
				// @todo Returns an error to the client.
				socket.emit(
					JSON.stringify( {
						'jsonrpc': '2.0',
						'error': {
							'code': -32601,
							'message' : 'No such method'
						},
						'id': json_rpc_id++,
					});
				);
				console.error('No such method: ' + message.method);
				return;
			}

			current = current[parts[i]];
		}

		if (!_.isFunction(current))
		{
			// @todo Returns an error to the client.
			socket.emit(
				JSON.stringify( {
					'jsonrpc': '2.0',
					'error': {
						'code': -32601,
						'message' : 'No such method'
					},
					'id': json_rpc_id++,
				});
			);
			console.error('No such method: ' + message.method);
			return;
		}

		current(message.params, new JSONResponse(socket));
	});
});