/* eslint-disable global-require, import/no-dynamic-require, import/prefer-default-export */
/* eslint-disable no-unused-vars, radix */
import path from 'path';
import _ from 'lodash';
import {makeExecutableSchema} from 'graphql-tools';
import {SubscriptionManager, PubSub} from 'graphql-subscriptions';
import GraphQLJSON from 'graphql-type-json';
import {
	GraphQLScalarType,
	GraphQLString,
} from 'graphql';
import {Kind} from 'graphql/language';
import {
	GraphQLEmail,
	GraphQLURL,
	GraphQLDateTime,
	GraphQLLimitedString,
	GraphQLPassword,
	GraphQLUUID,
} from 'graphql-custom-types';

const GraphQLStringOrInt = new GraphQLScalarType({
	name: 'StringOrInt',
	description: 'Value can be either an integer or a string',
	serialize(value) {
		return value;
	},
	parseValue(value) {
		return value;
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.INT) {
			return parseInt(ast.value, 10);
		}
		if (ast.kind === Kind.STRING) {
			return ast.value;
		}
		return null;
	},
});

const GraphQLStringTrimmed = new GraphQLScalarType({
	name: 'String',
	description: 'Value should be a string, it will be automatically trimmed',
	serialize(value) {
		return value;
	},
	parseValue(value) {
		return value;
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING) {
			return ast.value.trim();
		}
		return null;
	},
});

function makeRelayConnection(type) {
	return /* GraphQL */`
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
	`;
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

function parseGraphqlQueries(queries) {
	let matches;
	const re = /\)\s*:\s*[a-zA-Z0-9._-]+Connection\s+/i;
	// eslint-disable-next-line
	while (matches = re.exec(types)) {
		queries = queries.replace(matches[0], makeRelayConnection(matches[1]));
	}

	return queries;
}

function parseGraphqlSchema(schema) {
	// console.log(schema);
	let types = '';
	let queries = '';
	let mutations = '';
	let subscriptions = '';
	let matches;

	// Convert @paging.params to (first, after, last, before)
	const re = /(@paging\.params|paging\s*:\s*Default)/i;
	const pagingParams = 'first: Int\nafter: StringOrInt\nlast: Int\nbefore:StringOrInt';
	// eslint-disable-next-line
	while (matches = re.exec(schema)) {
		schema = schema.replace(matches[0], pagingParams);
	}

	// extract types
	matches = schema.match(/#\s*@types([\s\S]*?)((#\s*@(types|queries|mutations|subscriptions)|$))/i);
	if (matches) {
		types = parseGraphqlTypes(matches[1]);
	}

	// extract queries
	matches = schema.match(/#\s*@queries([\s\S]*?)((#\s*@(types|queries|mutations|subscriptions)|$))/i);
	if (matches) {
		queries = matches[1];
	}

	// extract mutations
	matches = schema.match(/#\s*@mutations([\s\S]*?)((#\s*@(types|queries|mutations|subscriptions)|$))/i);
	if (matches) {
		mutations = matches[1];
	}

	// extract subscriptions
	matches = schema.match(/#\s*@subscriptions([\s\S]*?)((#\s*@(types|queries|mutations|subscriptions)|$))/i);
	if (matches) {
		subscriptions = matches[1];
	}

	return {types, queries, mutations, subscriptions};
}

function getIdFromCursor(cursor) {
	const num = parseInt(cursor, 10);
	if (!isNaN(num) && num > 0 && isFinite(num)) return num;
	return parseInt(Buffer.from(cursor, 'base64').toString().substring(3)) || 0;
}

function getCursorFromId(id) {
	return Buffer.from(`sm:${id}`)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function getPagingParams({first, last, before, after}) {
	const isForwardPaging = !!first || !!after;
	const isBackwardPaging = !!last || !!before;
	const defaultLimit = 20;

	if (isForwardPaging) {
		return {
			limit: first || defaultLimit,
			offset: after ? getIdFromCursor(after) : 0,
		};
	}
	else if (isBackwardPaging) {
		let limit = last || defaultLimit;
		let offset = getIdFromCursor(before) - last;

		// Check to see if our before-page is underflowing past the 0th item
		if (offset < 0) {
			// Adjust the limit with the underflow value
			limit = Math.max(last + offset, 0);
			offset = 0;
		}

		return {limit, offset};
	}

	return {limit: defaultLimit, offset: 0};
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
		},
	};
}

function getConnectionResolver(query, args) {
	const {limit, offset} = getPagingParams(args);

	let nodes = null;
	let edges = null;
	const getNodes = async () => {
		if (!nodes) {
			nodes = await query.clone()
				.offset(offset)
				.limit(limit);
		}

		return nodes;
	};

	const getEdges = async () => {
		if (!edges) {
			const items = await getNodes();

			let i = 0;
			edges = items.map((item) => {
				i++;
				return {
					cursor: getCursorFromId(offset + i),
					node: item,
				};
			});
		}

		return edges;
	};

	const nodesResolver = async root => getNodes();
	const edgesResolver = async root => getEdges();
	const countResolver = async (root) => {
		const obj = await query.clone().count('* as count');
		return obj[0].count;
	};

	const pageInfoResolver = async (root) => {
		if (!edges) await getEdges();

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
			edgeCount,
		};
	};

	return {
		nodes: nodesResolver,
		edges: edgesResolver,
		totalCount: countResolver,
		pageInfo: pageInfoResolver,
	};
}

function getGraphQLTypeDefs({types, queries, mutations, subscriptions}) {
	const schema = [];
	const schemaDetails = [];

	if (queries && queries.length) {
		schema.push('query: Query');
		schemaDetails.push(`
			type Query {
				${queries.join('\n')}
			}
		`);
	}

	if (mutations && mutations.length) {
		schema.push('mutation: Mutation');
		schemaDetails.push(`
			type Mutation {
				${mutations.join('\n')}
			}
		`);
	}

	if (subscriptions && subscriptions.length) {
		schema.push('subscription: Subscription');
		schemaDetails.push(`
			type Subscription {
				${subscriptions.join('\n')}
			}
		`);
	}

	return /* GraphQL */`
		scalar JSON
		scalar StringOrInt
		scalar Email
		scalar URL
		scalar DateTime
		scalar UUID
		scalar String
		scalar StringOriginal

		schema {
			${schema.join('\n')}
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

		${schemaDetails.join('\n')}
	`;
}

function makeSchemaFromModules(modules, opts = {}) {
	const types = [];
	const queries = [];
	const mutations = [];
	const subscriptions = [];
	const resolvers = {};

	const typeResolvers = {
		JSON: GraphQLJSON,
		StringOrInt: GraphQLStringOrInt,
		Email: GraphQLEmail,
		URL: GraphQLURL,
		DateTime: GraphQLDateTime,
		UUID: GraphQLUUID,
		String: GraphQLStringTrimmed,
		StringOriginal: GraphQLString,
	};

	_.merge(resolvers, typeResolvers);

	modules.forEach((folder) => {
		let mod;
		if (typeof folder === 'string') {
			folder = path.resolve(opts.baseFolder || '', folder);
			mod = require(folder);
		}
		else {
			mod = folder;
		}

		if (mod.schema) {
			const parsed = parseGraphqlSchema(mod.schema);
			if (parsed.types) types.push(parsed.types);
			if (parsed.queries) queries.push(parsed.queries);
			if (parsed.mutations) mutations.push(parsed.mutations);
			if (parsed.subscriptions) subscriptions.push(parsed.subscriptions);
		}
		if (mod.types) types.push(parseGraphqlTypes(mod.types));
		if (mod.queries) queries.push(mod.queries);
		if (mod.mutations) mutations.push(mod.mutations);
		if (mod.subscriptions) subscriptions.push(mod.subscriptions);
		if (mod.resolvers) _.merge(resolvers, mod.resolvers);
	});

	const logger = {
		log(e) {
			console.log(e);
		},
	};

	const setupFunctions = {};
	if (resolvers.SubscriptionFilter) {
		_.forEach(resolvers.SubscriptionFilter, (filter, name) => {
			setupFunctions[name] = (options, args) => ({
				[name]: {
					filter: item => !!filter(item, args, options),
				},
			});
		});

		delete resolvers.SubscriptionFilter;
	}

	if (resolvers.SubscriptionMap) {
		_.forEach(resolvers.SubscriptionMap, (filter, name) => {
			setupFunctions[name] = filter;
		});

		delete resolvers.SubscriptionMap;
	}

	const schema = makeExecutableSchema({
		typeDefs: getGraphQLTypeDefs({types, queries, mutations, subscriptions}),
		resolvers,
		logger: opts.logger || logger,
		allowUndefinedInResolve: opts.allowUndefinedInResolve || false,
		resolverValidationOptions: opts.resolverValidationOptions || {},
	});

	const pubsub = new PubSub();

	const subscriptionManager = new SubscriptionManager({
		schema,
		pubsub,
		setupFunctions,
	});

	pubsub.out = function (key, message) {
		pubsub.publish('output', {key, message});
	};

	return {
		schema,
		subscriptionManager,
		pubsub,
	};
}

export * from './errors';
export {
	makeRelayConnection,
	getConnectionResolver,
	parseGraphqlSchema,
	parseGraphqlTypes,
	getGraphQLTypeDefs,
	makeSchemaFromModules,
};
