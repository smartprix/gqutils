'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _graphql = require('graphql');

const PageInfo = new _graphql.GraphQLObjectType({
	name: 'PageInfo',
	description: 'Information about pagination in a connection',
	fields: {
		startCursor: {
			type: _graphql.GraphQLString
		},
		endCursor: {
			type: _graphql.GraphQLString
		},
		hasNextPage: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
		},
		hasPreviousPage: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
		},
		edgeCount: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
		}
	}
});

const DeletedItem = new _graphql.GraphQLObjectType({
	name: 'DeletedItem',
	description: 'Deleted item. Only contains id of the item',
	fields: {
		id: {
			type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
		}
	}
});

const OrderDirection = new _graphql.GraphQLEnumType({
	name: 'OrderDirection',
	description: 'Possible directions in which to order a list of items when provided an orderBy argument.',
	values: {
		ASC: {
			value: 'ASC',
			description: 'Specifies an ascending order'
		},

		DESC: {
			value: 'DESC',
			description: 'Specifies a descending order'
		}
	}
});

exports.default = {
	PageInfo,
	DeletedItem,
	OrderDirection
};