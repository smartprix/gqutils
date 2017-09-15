import {
	GraphQLString,
	GraphQLInt,
	GraphQLFloat,
	GraphQLID,
	GraphQLBoolean,
	GraphQLScalarType,
} from 'graphql';
import {Kind} from 'graphql/language';
import {
	GraphQLEmail,
	GraphQLURL,
	GraphQLDateTime,
	GraphQLUUID,
} from 'graphql-custom-types';

import GraphQLJSON from 'graphql-type-json';

// http://dev.apollodata.com/tools/graphql-tools/scalars.html#Own-GraphQLScalarType-instance
const GraphQLStringTrimmed = new GraphQLScalarType({
	name: 'String',
	description: 'Value should be a string, it will be automatically trimmed',
	serialize: value => value,
	parseValue: value => value,
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING) {
			return ast.value.trim();
		}
		return null;
	},
});

const GraphQLStringOrInt = new GraphQLScalarType({
	name: 'StringOrInt',
	description: 'Value can be either an integer or a string',
	serialize: value => value,
	parseValue: value => value,
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

GraphQLString.name = 'StringOriginal';

export default {
	id: GraphQLID,
	int: GraphQLInt,
	float: GraphQLFloat,
	string: GraphQLStringTrimmed,
	stringoriginal: GraphQLString,
	stringorint: GraphQLStringOrInt,
	bool: GraphQLBoolean,
	boolean: GraphQLBoolean,
	email: GraphQLEmail,
	url: GraphQLURL,
	uuid: GraphQLUUID,
	datetime: GraphQLDateTime,
	json: GraphQLJSON,
};
