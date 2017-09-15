'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.makeSchemaFromModules = undefined;

var _errors = require('./errors');

Object.keys(_errors).forEach(function (key) {
	if (key === "default" || key === "__esModule") return;
	Object.defineProperty(exports, key, {
		enumerable: true,
		get: function () {
			return _errors[key];
		}
	});
});

var _connection = require('./connection');

Object.keys(_connection).forEach(function (key) {
	if (key === "default" || key === "__esModule") return;
	Object.defineProperty(exports, key, {
		enumerable: true,
		get: function () {
			return _connection[key];
		}
	});
});

var _Schema = require('./Schema');

Object.keys(_Schema).forEach(function (key) {
	if (key === "default" || key === "__esModule") return;
	Object.defineProperty(exports, key, {
		enumerable: true,
		get: function () {
			return _Schema[key];
		}
	});
});

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _graphqlTools = require('graphql-tools');

var _graphqlSubscriptions = require('graphql-subscriptions');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function makeSchemaFromModules(modules, opts = {}) {
	const schemas = [];
	const resolvers = {};

	modules.forEach(folder => {
		let mod;
		if (typeof folder === 'string') {
			folder = _path2.default.resolve(opts.baseFolder || '', folder);
			mod = require(folder);
		} else {
			mod = folder;
		}

		if (mod.schema) schemas.push(mod.schema);
		if (mod.resolvers) _lodash2.default.merge(resolvers, mod.resolvers);
	});

	const logger = {
		log(e) {
			console.log(e);
		}
	};

	const setupFunctions = {};
	if (!_lodash2.default.isEmpty(resolvers.Subscription)) {
		_lodash2.default.forEach(resolvers.Subscription, (subscriptionResolver, name) => {
			// change filter to utilize withFilter
			if (subscriptionResolver.filter) {
				subscriptionResolver.subscribe = (0, _graphqlSubscriptions.withFilter)(subscriptionResolver.subscribe, subscriptionResolver.filter);
				delete subscriptionResolver.filter;
			}
		});
	}

	const defaultSchemaName = opts.defaultSchemaName || 'default';

	const graphqlSchemas = (0, _Schema.makeSchemas)(schemas, resolvers, {
		schema: opts.schema || opts.schemas || [],
		defaultSchemaName,
		logger: opts.logger || logger,
		allowUndefinedInResolve: opts.allowUndefinedInResolve || false,
		resolverValidationOptions: opts.resolverValidationOptions || {}
	});

	const pubsub = new _graphqlSubscriptions.PubSub();

	pubsub.out = function (key, message) {
		pubsub.publish('output', { key, message });
	};

	return {
		schemas: graphqlSchemas,
		schema: graphqlSchemas,
		defaultSchema: graphqlSchemas[defaultSchemaName],
		pubsub
	};
} /* eslint-disable global-require, import/no-dynamic-require, import/prefer-default-export */
/* eslint-disable no-unused-vars, radix */
exports.makeSchemaFromModules = makeSchemaFromModules;