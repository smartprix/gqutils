'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _graphql = require('graphql');

var _language = require('graphql/language');

var _graphqlCustomTypes = require('graphql-custom-types');

var _graphqlTypeJson = require('graphql-type-json');

var _graphqlTypeJson2 = _interopRequireDefault(_graphqlTypeJson);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// http://dev.apollodata.com/tools/graphql-tools/scalars.html#Own-GraphQLScalarType-instance
const GraphQLStringTrimmed = new _graphql.GraphQLScalarType({
	name: 'String',
	description: 'Value should be a string, it will be automatically trimmed',
	serialize: value => value,
	parseValue: value => value,
	parseLiteral(ast) {
		if (ast.kind === _language.Kind.STRING) {
			return ast.value.trim();
		}
		return null;
	}
});

const GraphQLStringOrInt = new _graphql.GraphQLScalarType({
	name: 'StringOrInt',
	description: 'Value can be either an integer or a string',
	serialize: value => value,
	parseValue: value => value,
	parseLiteral(ast) {
		if (ast.kind === _language.Kind.INT) {
			return parseInt(ast.value, 10);
		}
		if (ast.kind === _language.Kind.STRING) {
			return ast.value;
		}
		return null;
	}
});

_graphql.GraphQLString.name = 'StringOriginal';

exports.default = {
	id: _graphql.GraphQLID,
	int: _graphql.GraphQLInt,
	float: _graphql.GraphQLFloat,
	string: GraphQLStringTrimmed,
	stringoriginal: _graphql.GraphQLString,
	stringorint: GraphQLStringOrInt,
	bool: _graphql.GraphQLBoolean,
	boolean: _graphql.GraphQLBoolean,
	email: _graphqlCustomTypes.GraphQLEmail,
	url: _graphqlCustomTypes.GraphQLURL,
	uuid: _graphqlCustomTypes.GraphQLUUID,
	datetime: _graphqlCustomTypes.GraphQLDateTime,
	json: _graphqlTypeJson2.default
};