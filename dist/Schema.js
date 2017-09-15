'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.Schema = exports.makeSchemas = undefined;

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _graphql = require('graphql');

var _graphqlTools = require('graphql-tools');

var _defaultScalars = require('./defaultScalars');

var _defaultScalars2 = _interopRequireDefault(_defaultScalars);

var _defaultTypes = require('./defaultTypes');

var _defaultTypes2 = _interopRequireDefault(_defaultTypes);

var _defaultArgs = require('./defaultArgs');

var _defaultArgs2 = _interopRequireDefault(_defaultArgs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function identity(value) {
	return value;
}

class Schema {
	constructor(schema, resolvers, options = {}) {
		if (!schema) {
			throw new Error('No schema provided');
		}

		this.originalSchema = _lodash2.default.castArray(schema);
		this.schemas = {};
		this.options = options;
		this.defaultSchemaName = options.defaultSchemaName || 'default';
		this.resolvers = resolvers || {};

		this.preprocess();
		this.separateSchemaItems();
	}

	preprocess() {
		let schemaNames = this.options.schemas || this.options.schema;
		if (!schemaNames) schemaNames = [];
		schemaNames = _lodash2.default.castArray(schemaNames);

		if (!schemaNames.includes(this.defaultSchemaName)) {
			schemaNames.push(this.defaultSchemaName);
		}

		schemaNames.forEach(schemaName => {
			this.schemas[schemaName] = {
				name: schemaName,
				types: {
					Query: {
						name: 'Query',
						description: 'The query root of this GraphQL interface.',
						fields: {},
						schema: schemaNames
					},
					Mutation: {
						name: 'Mutation',
						description: 'The mutation root of this GraphQL interface.',
						fields: {},
						schema: schemaNames
					},
					Subscription: {
						name: 'Subscription',
						description: 'The subscription root of this GraphQL interface.',
						fields: {},
						schema: schemaNames
					}
				},
				inputTypes: {},
				enums: {},
				interfaces: {},
				scalars: {},
				unions: {}
			};
		});

		this.allSchemaItems = this.schemas[this.defaultSchemaName];
	}

	handleSchemaItem(schemaItem, itemName = null) {
		if (!_lodash2.default.isPlainObject(schemaItem)) {
			throw new Error('Schema must be an object (or maybe you forgot to define graphql property on some schema)');
		}

		itemName = schemaItem.name || itemName;
		schemaItem.name = itemName;

		if (!schemaItem.graphql) {
			throw new Error(`graphql property (base type) not defined for ${itemName} `);
		}

		if (!itemName) {
			throw new Error('Graphql name not given');
		}

		const schemaItems = this.allSchemaItems;

		switch (schemaItem.graphql) {
			case 'type':
				schemaItems.types[itemName] = schemaItem;
				break;

			case 'query':
				schemaItems.types.Query.fields[itemName] = schemaItem;
				break;

			case 'mutation':
				schemaItems.types.Mutation.fields[itemName] = schemaItem;
				break;

			case 'subscription':
				schemaItems.types.Subscription.fields[itemName] = schemaItem;
				break;

			case 'input':
				schemaItems.inputTypes[itemName] = schemaItem;
				break;

			case 'enum':
				schemaItems.enums[itemName] = schemaItem;
				break;

			case 'interface':
				schemaItems.interfaces[itemName] = schemaItem;
				break;

			case 'scalar':
				schemaItems.scalars[itemName] = schemaItem;
				break;

			case 'union':
				schemaItems.unions[itemName] = schemaItem;
				break;

			default:
				throw new Error(`Unknown graphql base type ${schemaItem.graphql}`);
		}
	}

	// eslint-disable-next-line
	getGraphqlTypeFromName(schema, typeName) {
		const lowerTypeName = typeName.toLowerCase();

		let type = null;

		if (lowerTypeName in _defaultScalars2.default) {
			type = { _graphql: _defaultScalars2.default[lowerTypeName] };
		} else if (typeName in schema.scalars) {
			type = schema.scalars[typeName];
		} else if (typeName in schema.enums) {
			type = schema.enums[typeName];
		} else if (typeName in schema.interfaces) {
			type = schema.interfaces[typeName];
		} else if (typeName in schema.inputTypes) {
			type = schema.inputTypes[typeName];
		} else if (typeName in schema.types) {
			type = schema.types[typeName];
		} else if (typeName in schema.unions) {
			type = schema.types[typeName];
		} else if (typeName in _defaultTypes2.default) {
			type = { _graphql: _defaultTypes2.default[typeName] };
		}

		if (!type) {
			throw new Error(`Unknown type ${typeName}`);
		}

		return type._graphql;
	}

	// eslint-disable-next-line
	getTypeName(type) {
		const regex = /^[a-zA-Z0-9_]+$/;
		const matches = type.match(regex);
		return matches && matches[0];
	}

	schemaHasType(schema, type) {
		if (!type || typeof type !== 'string') {
			return true;
		}

		const typeName = this.getTypeName(type);
		if (!typeName) return false;

		return typeName.toLowerCase() in _defaultScalars2.default || typeName in _defaultTypes2.default || typeName in schema.scalars || typeName in schema.enums || typeName in schema.interfaces || typeName in schema.inputTypes || typeName in schema.types || typeName in schema.unions;
	}

	parseType(schema, type) {
		if (!type) {
			throw new Error('Missing type');
		}

		if (typeof type !== 'string') {
			return type;
		}

		// 1 - brace 2
		// 2 - brace 1
		// 3 - type name
		// 4 - type non null
		// 5 - close brace 1
		// 6 - close brace 2
		// 7 - list non null
		const regex = /^(\[?)(\[?)([a-zA-Z0-9_]+)(!?)(\]?)(\]?)(!?)$/;
		const matches = type.match(regex);
		if (!matches || !matches[3]) {
			throw new Error(`Invalid type ${type}`);
		}

		const typeName = matches[3];
		const isDoubleList = matches[1] && matches[2];
		const isList = matches[1] || matches[2];
		const isTypeNonNull = !!matches[4];
		const isListNonNull = !!matches[7];

		let graphqlType = this.getGraphqlTypeFromName(schema, typeName);
		if (!graphqlType) return null;

		if (isTypeNonNull) {
			graphqlType = new _graphql.GraphQLNonNull(graphqlType);
		}

		if (isDoubleList) {
			graphqlType = new _graphql.GraphQLList(new _graphql.GraphQLList(graphqlType));
		} else if (isList) {
			graphqlType = new _graphql.GraphQLList(graphqlType);
		}

		if (isListNonNull) {
			graphqlType = new _graphql.GraphQLNonNull(graphqlType);
		}

		return graphqlType;
	}

	parseTypes(schema, types) {
		return _lodash2.default.filter(_lodash2.default.map(types, type => this.parseType(schema, type)));
	}

	handleSchemaEntry(schemaEntry) {
		if (_lodash2.default.isPlainObject(schemaEntry)) {
			if (schemaEntry.graphql) {
				this.handleSchemaItem(schemaEntry);
				return;
			}

			_lodash2.default.forEach(schemaEntry, (schemaItem, itemName) => {
				this.handleSchemaItem(schemaItem, itemName);
			});
		} else if (_lodash2.default.isArray(schemaEntry)) {
			_lodash2.default.forEach(schemaEntry, schemaItem => {
				this.handleSchemaItem(schemaItem);
			});
		} else {
			throw new Error(`Unknown schema entry ${schemaEntry}`);
		}
	}

	separateSchemaItems() {
		this.originalSchema.forEach(schemaEntry => {
			this.handleSchemaEntry(schemaEntry);
		});
	}

	shouldSchemaContain(schema, schemaItem, options = {}) {
		const schemaName = schema.name;

		// default schema contains everything
		if (schemaName === this.defaultSchemaName) {
			return true;
		}

		let schemaNames = schemaItem.schemas || schemaItem.schema;

		// include according to includeByDefault if schema name is not given
		if (schemaNames === null || schemaNames === undefined) {
			return options.includeByDefault || false;
		}

		schemaNames = _lodash2.default.castArray(schemaNames);

		if (!schemaNames.includes(schemaName)) {
			return false;
		}

		const types = schemaItem.interface || schemaItem.interfaces || schemaItem.implements || schemaItem.type;

		if (_lodash2.default.isArray(types)) {
			for (const type of types) {
				if (!this.schemaHasType(schema, type)) return false;
			}

			return true;
		}

		return this.schemaHasType(schema, types);
	}

	// eslint-disable-next-line
	makeRelayConnection(schema, schemaItem) {
		if (!schemaItem.relayConnection) return;

		const typeName = schemaItem.name;

		const connectionName = `${typeName}Connection`;
		const edgeName = `${typeName}Edge`;

		if (!(edgeName in schema.types)) {
			schema.types[edgeName] = {
				name: edgeName,
				description: 'An edge in a connection',
				fields: {
					cursor: 'String!',
					node: typeName
				}
			};
		}

		if (!(connectionName in schema.types)) {
			schema.types[connectionName] = {
				name: connectionName,
				description: `A list of ${typeName}`,
				fields: {
					edges: `[${edgeName}]`,
					nodes: `[${typeName}]`,
					pageInfo: 'PageInfo!',
					totalCount: 'Int!'
				}
			};
		}
	}

	collectGraphqlTypeInSchema(schema, name) {
		const schemaItems = this.schemas[this.defaultSchemaName][name];

		_lodash2.default.forEach(schemaItems, schemaItem => {
			if (this.shouldSchemaContain(schema, schemaItem)) {
				schema[name][schemaItem.name] = schemaItem;

				if (name === 'types') {
					this.makeRelayConnection(schema, schemaItem);
				}
			}
		});
	}

	parseGraphqlField(schema, field, resolve) {
		const schemaContainsField = this.shouldSchemaContain(schema, field, { includeByDefault: true });
		if (!schemaContainsField) return false;

		if (typeof field === 'string') {
			const graphqlType = this.parseType(schema, field);
			if (!graphqlType) return null;

			return {
				type: graphqlType,
				resolve
			};
		}

		const graphqlType = this.parseType(schema, field.type);
		if (!graphqlType) return null;

		const graphqlField = {
			type: graphqlType
		};

		if (field.description) {
			graphqlField.description = field.description;
		}

		if (field.default) {
			graphqlField.defaultValue = field.default;
		}

		if (field.deprecationReason) {
			graphqlField.deprecationReason = field.deprecationReason;
		}

		if (resolve) {
			graphqlField.resolve = resolve;
		} else if (field.resolve) {
			graphqlField.resolve = field.resolve;
		}

		if (field.args) {
			const typeName = this.getTypeName(field.type);
			graphqlField.args = this.parseGraphqlArgs(schema, field.args, typeName);
		}

		return graphqlField;
	}

	parseGraphqlArgs(schema, args, typeName) {
		if (args.$default) {
			// since we are modifying args, clone it first
			args = _lodash2.default.cloneDeep(args);

			const typeFields = schema.types[typeName].fields;

			_lodash2.default.forEach(args.$default, argName => {
				// handle paging args
				if (argName === '$paging') {
					_lodash2.default.defaults(args, _defaultArgs2.default.pagingArgs);
					return;
				}

				// handle order args
				if (argName === '$order') {
					_lodash2.default.defaults(args, _defaultArgs2.default.orderArgs);
					return;
				}

				if (argName in args) return;
				if (!(argName in typeFields)) return;

				let field = typeFields[argName];
				if (typeof field === 'string') {
					// remove required
					field = field.replace(/!$/, '');
				} else {
					field = _lodash2.default.clone(field);

					// remove required
					if (typeof field.type === 'string') {
						field.type = field.type.replace(/!$/, '');
					}
				}

				args[argName] = field;
			});

			delete args.$default;
		}

		return this.parseGraphqlFields(schema, args);
	}

	parseGraphqlFields(schema, fields, parentName) {
		const parsedFields = {};

		_lodash2.default.forEach(fields, (field, fieldName) => {
			const resolve = parentName && this.resolvers[parentName] && this.resolvers[parentName][fieldName];
			const parsedField = this.parseGraphqlField(schema, field, resolve);
			if (!parsedField) return;

			fieldName = field.name || fieldName;
			parsedFields[fieldName] = parsedField;
		});

		return parsedFields;
	}

	parseGraphqlEnumValue(schema, value, name) {
		const schemaContainsField = this.shouldSchemaContain(schema, value, { includeByDefault: true });
		if (!schemaContainsField) return null;

		if (typeof value === 'string') {
			return { value };
		}

		const enumValue = 'value' in value ? value.value : name;

		return {
			value: enumValue,
			description: value.description,
			deprecationReason: value.deprecationReason
		};
	}

	parseGraphqlEnumValues(schema, values) {
		const parsedValues = {};

		_lodash2.default.forEach(values, (value, name) => {
			const parsedField = this.parseGraphqlEnumValue(schema, value, name);
			if (!parsedField) return;

			name = value.name || name;
			parsedValues[name] = value;
		});

		return parsedValues;
	}

	// eslint-disable-next-line
	parseGraphqlScalar(schema, scalar) {
		if (scalar._graphql) return;

		if (scalar.resolve) {
			scalar._graphql = scalar.resolve;
			return;
		}

		scalar._graphql = new _graphql.GraphQLScalarType({
			name: scalar.name,
			description: scalar.description,
			serialize: scalar.serialize || identity,
			parseValue: scalar.parseValue || identity,
			parseLiteral: scalar.parseLiteral
		});
	}

	parseGraphqlEnum(schema, schemaItem) {
		schemaItem._graphql = new _graphql.GraphQLEnumType({
			name: schemaItem.name,
			description: schemaItem.description,
			values: this.parseGraphqlEnumValues(schema, schemaItem.values)
		});
	}

	parseGraphqlInterface(schema, schemaItem) {
		schemaItem._graphql = new _graphql.GraphQLInterfaceType({
			name: schemaItem.name,
			description: schemaItem.description,
			fields: () => this.parseGraphqlFields(schema, schemaItem.fields, schemaItem.name),
			resolveType: schemaItem.resolveType
		});
	}

	parseGraphqlInputType(schema, inputType) {
		inputType._graphql = new _graphql.GraphQLInputObjectType({
			name: inputType.name,
			description: inputType.description,
			fields: () => this.parseGraphqlFields(schema, inputType.fields)
		});
	}

	parseGraphqlType(schema, type) {
		const graphqlType = {
			name: type.name,
			description: type.description,
			fields: () => {
				const fields = this.parseGraphqlFields(schema, type.fields, type.name);
				if (_lodash2.default.isEmpty(fields)) {
					return {
						noop: {
							type: _graphql.GraphQLString,
							description: 'Placeholder Field',
							resolve: () => 'noop'
						}
					};
				}

				return fields;
			},
			isTypeOf: type.isTypeOf
		};

		let interfaces = type.interface || type.interfaces || type.implements;
		if (interfaces) {
			interfaces = _lodash2.default.castArray(interfaces);
			graphqlType.interfaces = () => this.parseTypes(schema, interfaces);
		}

		type._graphql = new _graphql.GraphQLObjectType(graphqlType);
	}

	parseGraphqlUnion(schema, union) {
		union._graphql = new _graphql.GraphQLUnionType({
			name: union.name,
			description: union.description,
			types: () => this.parseTypes(schema, union.types),
			resolveType: union.resolveType
		});
	}

	parseGraphqlScalars(schema, scalars) {
		_lodash2.default.forEach(scalars, scalar => this.parseGraphqlScalar(schema, scalar));
	}

	parseGraphqlEnums(schema, enums) {
		_lodash2.default.forEach(enums, schemaItem => this.parseGraphqlEnum(schema, schemaItem));
	}

	parseGraphqlInterfaces(schema, interfaces) {
		_lodash2.default.forEach(interfaces, schemaItem => this.parseGraphqlInterface(schema, schemaItem));
	}

	parseGraphqlInputTypes(schema, inputTypes) {
		_lodash2.default.forEach(inputTypes, inputType => this.parseGraphqlInputType(schema, inputType));
	}

	parseGraphqlTypes(schema, types) {
		_lodash2.default.forEach(types, type => this.parseGraphqlType(schema, type));
	}

	parseGraphqlUnions(schema, unions) {
		_lodash2.default.forEach(unions, union => this.parseGraphqlType(schema, union));
	}

	parseGraphqlSchema(schema) {
		this.collectGraphqlTypeInSchema(schema, 'scalars');
		this.collectGraphqlTypeInSchema(schema, 'enums');
		this.collectGraphqlTypeInSchema(schema, 'interfaces');
		this.collectGraphqlTypeInSchema(schema, 'inputTypes');
		this.collectGraphqlTypeInSchema(schema, 'types');
		this.collectGraphqlTypeInSchema(schema, 'unions');

		this.parseGraphqlScalars(schema, schema.scalars);
		this.parseGraphqlEnums(schema, schema.enums);
		this.parseGraphqlInterfaces(schema, schema.interfaces);
		this.parseGraphqlInputTypes(schema, schema.inputTypes);
		this.parseGraphqlTypes(schema, schema.types);
		this.parseGraphqlUnions(schema, schema.unions);

		const graphqlSchema = new _graphql.GraphQLSchema({
			query: schema.types.Query._graphql,
			mutation: schema.types.Mutation._graphql,
			subscription: schema.types.Subscription._graphql
		});

		if (this.options.resolverValidationOptions) {
			(0, _graphqlTools.assertResolveFunctionsPresent)(graphqlSchema, this.options.resolverValidationOptions);
		}

		if (this.options.logger) {
			(0, _graphqlTools.addErrorLoggingToSchema)(graphqlSchema, this.options.logger);
		}

		if (!this.options.allowUndefinedInResolve) {
			(0, _graphqlTools.addCatchUndefinedToSchema)(graphqlSchema);
		}

		return graphqlSchema;
	}

	parseGraphqlSchemas() {
		const finalSchemas = {};

		_lodash2.default.forEach(this.schemas, (schema, schemaName) => {
			finalSchemas[schemaName] = this.parseGraphqlSchema(schema);
		});

		return finalSchemas;
	}
}

function makeSchemas(schemas, resolvers, options = {}) {
	return new Schema(schemas, resolvers, options).parseGraphqlSchemas();
}

exports.makeSchemas = makeSchemas;
exports.Schema = Schema;