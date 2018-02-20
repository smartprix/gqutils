function getIdFromCursor(cursor) {
	const num = Number(cursor);
	if (!isNaN(num) && num > 0 && isFinite(num)) return num;
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

function getConnectionResolver(query, args) {
	const {limit, offset} = getPagingParams(args);

	let nodes = null;
	let edges = null;
	const getNodes = async () => {
		if (!nodes) {
			nodes = query.clone()
				.offset(offset)
				.limit(limit)
				.then(result => result);
		}

		return nodes;
	};

	const getEdgesQuery = async () => {
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

	const getEdges = async () => {
		if (!edges) {
			edges = getEdgesQuery();
		}

		return edges;
	};

	const nodesResolver = async () => getNodes();
	const edgesResolver = async () => getEdges();
	const countResolver = async () => {
		const knex = query.modelClass().knex();
		const obj = await knex.count('* as count')
			.from(knex.raw('(' + query.toString() + ') as __q'));
		return obj[0].count;
	};

	const pageInfoResolver = async () => {
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

export {
	getConnectionResolver,
	getIdFromCursor,
	getCursorFromId,
};
