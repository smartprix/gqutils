function getIdFromCursor(cursor) {
	const num = Number(cursor);
	if (!Number.isNaN(num) && num > 0 && Number.isFinite(num)) return num;
	return Number(Buffer.from(cursor, 'base64').toString().substring(3)) || 0;
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

function wrapInFunc(item) {
	if (item === undefined) return undefined;
	if (typeof item !== 'function') return () => item;
	return (...args) => item(...args);
}

// eslint-disable-next-line
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

function getConnectionResolver(query, args, options = {}) {
	const {limit, offset} = getPagingParams(args);
	const resolvers = options.resolvers || {};

	let nodes = null;
	let edges = null;

	let getNodesQuery = wrapInFunc(resolvers.nodes);
	if (!getNodesQuery) {
		getNodesQuery = async () => {
			if (!nodes) {
				nodes = query.clone()
					.offset(offset)
					.limit(limit)
					.then(result => result);
			}

			return nodes;
		};
	}

	const getNodes = async () => {
		if (!nodes) {
			nodes = getNodesQuery();
		}

		return nodes;
	};

	let getEdgesQuery;
	if (resolvers.edges) {
		if (typeof resolvers.edges === 'function') {
			getEdgesQuery = resolvers.edges;
		}
		else {
			getEdgesQuery = async () => {
				const items = await getNodes();

				const edgeResolver = Object.assign({
					node: (node => node),
					cursor: ((node, i, info) => getCursorFromId(info.offset + i)),
				}, _.mapValues(resolvers.edges, item => wrapInFunc(item)));

				let i = 0;
				return items.map((item) => {
					i++;
					return _.mapValues(edgeResolver, key => key(item, i, {offset}));
				});
			};
		}
	}
	else {
		getEdgesQuery = async () => {
			const items = await getNodes();

			let i = 0;
			return items.map((item) => {
				i++;
				return {
					cursor: getCursorFromId(offset + i),
					node: item,
				};
			});
		};
	}

	const getEdges = async () => {
		if (!edges) {
			edges = getEdgesQuery();
		}

		return edges;
	};

	let countResolver = wrapInFunc(resolvers.totalCount);
	if (!countResolver) {
		countResolver = async () => {
			const allNodes = await getNodes();
			if (!offset) {
				if (!allNodes) return 0;
				if (allNodes.length < limit) return allNodes.length;
			}

			const knex = query.modelClass().knex();
			const obj = await knex.count('* as count')
				.from(knex.raw('(' + query.toString().replace(/\?/g, '\\?') + ') as __q'));
			return obj[0].count;
		};
	}

	let pageInfoResolver = wrapInFunc(resolvers.pageInfo);
	if (!pageInfoResolver) {
		pageInfoResolver = async () => {
			const allEdges = await getEdges();

			const edgeCount = allEdges.length;
			const firstEdge = allEdges[0];
			const lastEdge = allEdges[edgeCount - 1];

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
	}

	const connectionResolver = {
		nodes: getNodes,
		edges: getEdges,
		totalCount: countResolver,
		pageInfo: pageInfoResolver,
	};

	// extra resolvers
	_.forEach(resolvers, (resolver, key) => {
		if (!['nodes', 'edges', 'totalCount', 'pageInfo'].includes(key)) {
			connectionResolver[key] = resolver;
		}
	});

	return connectionResolver;
}

export {
	getConnectionResolver,
	getIdFromCursor,
	getCursorFromId,
};
