/* eslint-disable global-require, import/no-dynamic-require, import/prefer-default-export */
/* eslint-disable no-unused-vars, radix */
import path from 'path';
import _ from 'lodash';
import {makeExecutableSchema} from 'graphql-tools';

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

	return {types, queries, mutations};
}

function getIdFromCursor(cursor) {
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
			offset: after ? getIdFromCursor(after) + 1 : 0,
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

function getGraphQLTypeDefs({types, queries, mutations}) {
	return /* GraphQL */`
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
	`;
}

function makeSchemaFromModules(modules, opts = {}) {
	const types = [];
	const queries = [];
	const mutations = [];
	const resolvers = {};

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
		}
		if (mod.types) types.push(parseGraphqlTypes(mod.types));
		if (mod.queries) queries.push(mod.queries);
		if (mod.mutations) mutations.push(mod.mutations);
		if (mod.resolvers) _.merge(resolvers, mod.resolvers);
	});

	const logger = {
		log(e) {
			console.log(e);
		},
	};

	return makeExecutableSchema({
		typeDefs: getGraphQLTypeDefs({types, queries, mutations}),
		resolvers,
		logger: opts.logger || logger,
		allowUndefinedInResolve: opts.allowUndefinedInResolve || false,
		resolverValidationOptions: opts.resolverValidationOptions || {},
	});
}

export {
	makeRelayConnection,
	getConnectionResolver,
	parseGraphqlSchema,
	parseGraphqlTypes,
	getGraphQLTypeDefs,
	makeSchemaFromModules,
};
