'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function getIdFromCursor(cursor) {
	const num = Number(cursor);
	if (!isNaN(num) && num > 0 && isFinite(num)) return num;
	return Number(Buffer.from(cursor, 'base64').toString().substring(3)) || 0;
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
			offset: after ? getIdFromCursor(after) : 0
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
				nodes = query.clone().offset(offset).limit(limit).then(function (result) {
					return result;
				});
			}

			return nodes;
		});

		return function getNodes() {
			return _ref.apply(this, arguments);
		};
	})();

	const getEdgesQuery = (() => {
		var _ref2 = _asyncToGenerator(function* () {
			const items = yield getNodes();

			let i = 0;
			return items.map(function (item) {
				i++;
				return {
					cursor: getCursorFromId(offset + i),
					node: item
				};
			});
		});

		return function getEdgesQuery() {
			return _ref2.apply(this, arguments);
		};
	})();

	const getEdges = (() => {
		var _ref3 = _asyncToGenerator(function* () {
			if (!edges) {
				edges = getEdgesQuery();
			}

			return edges;
		});

		return function getEdges() {
			return _ref3.apply(this, arguments);
		};
	})();

	const nodesResolver = (() => {
		var _ref4 = _asyncToGenerator(function* () {
			return getNodes();
		});

		return function nodesResolver() {
			return _ref4.apply(this, arguments);
		};
	})();
	const edgesResolver = (() => {
		var _ref5 = _asyncToGenerator(function* () {
			return getEdges();
		});

		return function edgesResolver() {
			return _ref5.apply(this, arguments);
		};
	})();
	const countResolver = (() => {
		var _ref6 = _asyncToGenerator(function* () {
			const knex = query.modelClass().knex();
			const obj = yield knex.count('* as count').from(knex.raw('(' + query.toString() + ') as __q'));
			return obj[0].count;
		});

		return function countResolver() {
			return _ref6.apply(this, arguments);
		};
	})();

	const pageInfoResolver = (() => {
		var _ref7 = _asyncToGenerator(function* () {
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

		return function pageInfoResolver() {
			return _ref7.apply(this, arguments);
		};
	})();

	return {
		nodes: nodesResolver,
		edges: edgesResolver,
		totalCount: countResolver,
		pageInfo: pageInfoResolver
	};
}

exports.getConnectionResolver = getConnectionResolver;
exports.getIdFromCursor = getIdFromCursor;
exports.getCursorFromId = getCursorFromId;