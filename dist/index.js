'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.makeSchemaFromModules = exports.getGraphQLTypeDefs = exports.parseGraphqlTypes = exports.parseGraphqlSchema = exports.getConnectionResolver = exports.makeRelayConnection = undefined;

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _graphqlTools = require('graphql-tools');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; } /* eslint-disable global-require, import/no-dynamic-require, import/prefer-default-export */
/* eslint-disable no-unused-vars, radix */


function makeRelayConnection(type) {
	return (/* GraphQL */`
		type ${type}Connection {
			edges: [${type}Edge]
			nodes: [${type}]
			pageInfo: PageInfo!
			totalCount: Int!
		}

		type ${type}Edge {
			cursor: String!
			node: ${type}
		}
	`
	);
}

function parseGraphqlTypes(types) {
	let matches;
	const re = /@connection\s*\(\s*([a-zA-Z0-9._-]+)\s*\)/i;
	// eslint-disable-next-line
	while (matches = re.exec(types)) {
		types = types.replace(matches[0], makeRelayConnection(matches[1]));
	}

	return types;
}

function parseGraphqlSchema(schema) {
	// console.log(schema);
	let types = '';
	let queries = '';
	let mutations = '';
	let matches;

	matches = schema.match(/#\s*@types([\s\S]*?)((#\s*@(types|queries|mutations)|$))/i);
	if (matches) {
		types = parseGraphqlTypes(matches[1]);
	}

	matches = schema.match(/#\s*@queries([\s\S]*?)((#\s*@(types|queries|mutations)|$))/i);
	if (matches) {
		queries = matches[1];
	}

	matches = schema.match(/#\s*@mutations([\s\S]*?)((#\s*@(types|queries|mutations)|$))/i);
	if (matches) {
		mutations = matches[1];
	}

	return { types, queries, mutations };
}

function getIdFromCursor(cursor) {
	return parseInt(Buffer.from(cursor, 'base64').toString().substring(3)) || 0;
}

function getCursorFromId(id) {
	return Buffer.from(`sm:${id}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getPagingParams({ first, last, before, after }) {
	const isForwardPaging = !!first || !!after;
	const isBackwardPaging = !!last || !!before;
	const defaultLimit = 20;

	if (isForwardPaging) {
		return {
			limit: first || defaultLimit,
			offset: after ? getIdFromCursor(after) + 1 : 0
		};
	} else if (isBackwardPaging) {
		let limit = last || defaultLimit;
		let offset = getIdFromCursor(before) - last;

		// Check to see if our before-page is underflowing past the 0th item
		if (offset < 0) {
			// Adjust the limit with the underflow value
			limit = Math.max(last + offset, 0);
			offset = 0;
		}

		return { limit, offset };
	}

	return { limit: defaultLimit, offset: 0 };
}

function makeFuture(asyncFunction) {
	return {
		promise: null,
		then(callback) {
			if (!this.promise) this.promise = asyncFunction();
			return this.promise.then(callback);
		},
		catch(callback) {
			if (!this.promise) this.promise = asyncFunction();
			return this.promise.catch(callback);
		}
	};
}

function getConnectionResolver(query, args) {
	const { limit, offset } = getPagingParams(args);

	let nodes = null;
	let edges = null;
	const getNodes = (() => {
		var _ref = _asyncToGenerator(function* () {
			if (!nodes) {
				nodes = yield query.clone().offset(offset).limit(limit);
			}

			return nodes;
		});

		return function getNodes() {
			return _ref.apply(this, arguments);
		};
	})();

	const getEdges = (() => {
		var _ref2 = _asyncToGenerator(function* () {
			if (!edges) {
				const items = yield getNodes();

				let i = 0;
				edges = items.map(function (item) {
					i++;
					return {
						cursor: getCursorFromId(offset + i),
						node: item
					};
				});
			}

			return edges;
		});

		return function getEdges() {
			return _ref2.apply(this, arguments);
		};
	})();

	const nodesResolver = (() => {
		var _ref3 = _asyncToGenerator(function* (root) {
			return getNodes();
		});

		return function nodesResolver(_x) {
			return _ref3.apply(this, arguments);
		};
	})();
	const edgesResolver = (() => {
		var _ref4 = _asyncToGenerator(function* (root) {
			return getEdges();
		});

		return function edgesResolver(_x2) {
			return _ref4.apply(this, arguments);
		};
	})();
	const countResolver = (() => {
		var _ref5 = _asyncToGenerator(function* (root) {
			const obj = yield query.clone().count('* as count');
			return obj[0].count;
		});

		return function countResolver(_x3) {
			return _ref5.apply(this, arguments);
		};
	})();

	const pageInfoResolver = (() => {
		var _ref6 = _asyncToGenerator(function* (root) {
			if (!edges) yield getEdges();

			const edgeCount = edges.length;
			const firstEdge = edges[0];
			const lastEdge = edges[edgeCount - 1];

			const hasPreviousPage = offset > 0;
			const hasNextPage = edgeCount === limit;

			return {
				startCursor: firstEdge ? firstEdge.cursor : null,
				endCursor: lastEdge ? lastEdge.cursor : null,
				hasPreviousPage,
				hasNextPage,
				edgeCount
			};
		});

		return function pageInfoResolver(_x4) {
			return _ref6.apply(this, arguments);
		};
	})();

	return {
		nodes: nodesResolver,
		edges: edgesResolver,
		totalCount: countResolver,
		pageInfo: pageInfoResolver
	};
}

function getGraphQLTypeDefs({ types, queries, mutations }) {
	return (/* GraphQL */`
		schema {
			query: Query
			mutation: Mutation
		}

		enum OrderDirection {
			ASC
			DESC
		}

		type PageInfo {
			startCursor: String
			endCursor: String
			hasNextPage: Boolean!
			hasPreviousPage: Boolean!
			edgeCount: Int!
		}

		type DeletedItem {
			id: ID!
		}

		${types.join('\n')}

		type Query {
			${queries.join('\n')}
		}

		type Mutation {
			${mutations.join('\n')}
		}
	`
	);
}

function makeSchemaFromModules(modules, opts = {}) {
	const types = [];
	const queries = [];
	const mutations = [];
	const resolvers = {};

	modules.forEach(folder => {
		let mod;
		if (typeof folder === 'string') {
			folder = _path2.default.resolve(opts.baseFolder || '', folder);
			console.log(folder);
			mod = require(folder);
		} else {
			mod = folder;
		}

		if (mod.schema) {
			const parsed = parseGraphqlSchema(mod.schema);
			if (parsed.types) types.push(parsed.types);
			if (parsed.queries) queries.push(parsed.queries);
			if (parsed.mutations) mutations.push(parsed.mutations);
		}
		if (mod.types) types.push(parseGraphqlTypes(mod.types));
		if (mod.queries) queries.push(mod.queries);
		if (mod.mutations) mutations.push(mod.mutations);
		if (mod.resolvers) _lodash2.default.merge(resolvers, mod.resolvers);
	});

	const logger = {
		log(e) {
			console.log(e);
		}
	};

	console.log(getGraphQLTypeDefs({ types, queries, mutations }));

	return (0, _graphqlTools.makeExecutableSchema)({
		typeDefs: getGraphQLTypeDefs({ types, queries, mutations }),
		resolvers,
		logger: opts.logger || logger,
		allowUndefinedInResolve: opts.allowUndefinedInResolve || false,
		resolverValidationOptions: opts.resolverValidationOptions || {}
	});
}

exports.makeRelayConnection = makeRelayConnection;
exports.getConnectionResolver = getConnectionResolver;
exports.parseGraphqlSchema = parseGraphqlSchema;
exports.parseGraphqlTypes = parseGraphqlTypes;
exports.getGraphQLTypeDefs = getGraphQLTypeDefs;
exports.makeSchemaFromModules = makeSchemaFromModules;