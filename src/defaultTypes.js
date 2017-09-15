import {
	GraphQLString,
	GraphQLInt,
	GraphQLID,
	GraphQLBoolean,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLEnumType,
} from 'graphql';

const PageInfo = new GraphQLObjectType({
	name: 'PageInfo',
	description: 'Information about pagination in a connection',
	fields: {
		startCursor: {
			type: GraphQLString,
		},
		endCursor: {
			type: GraphQLString,
		},
		hasNextPage: {
			type: new GraphQLNonNull(GraphQLBoolean),
		},
		hasPreviousPage: {
			type: new GraphQLNonNull(GraphQLBoolean),
		},
		edgeCount: {
			type: new GraphQLNonNull(GraphQLInt),
		},
	},
});

const DeletedItem = new GraphQLObjectType({
	name: 'DeletedItem',
	description: 'Deleted item. Only contains id of the item',
	fields: {
		id: {
			type: new GraphQLNonNull(GraphQLID),
		},
	},
});

const OrderDirection = new GraphQLEnumType({
	name: 'OrderDirection',
	description: 'Possible directions in which to order a list of items when provided an orderBy argument.',
	values: {
		ASC: {
			value: 'ASC',
			description: 'Specifies an ascending order',
		},

		DESC: {
			value: 'DESC',
			description: 'Specifies a descending order',
		},
	},
});

export default {
	PageInfo,
	DeletedItem,
	OrderDirection,
};
