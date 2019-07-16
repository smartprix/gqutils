import _ from 'lodash';
import {
	GraphQLSchema,
	GraphQLObjectType,
	GraphQLInputObjectType,
	GraphQLEnumType,
	GraphQLInterfaceType,
	GraphQLScalarType,
	GraphQLUnionType,
	GraphQLString,
	GraphQLList,
	GraphQLNonNull,
} from 'graphql';

import {
	addCatchUndefinedToSchema,
	addErrorLoggingToSchema,
	assertResolveFunctionsPresent,
} from 'graphql-tools';

import {withFilter} from 'graphql-subscriptions';

import defaultScalars from './defaultScalars';
import defaultTypes from './defaultTypes';
import defaultArgs from './defaultArgs';
import {toGqlArg, GqlEnum, GqlFragment} from './helpers';

function identity(value) {
	return value;
}

function mergeFields(field1, field2) {
	if (typeof field1 === 'string' && typeof field2 === 'string') return field2;

	if (field1 === undefined) return field2;
	if (field2 === undefined) return field1;

	if (typeof field1 === 'string') field1 = {type: field1};
	if (typeof field2 === 'string') field2 = {type: field2};

	return Object.assign({}, field1, field2);
}

function getMergedTypeFieldsWithInterfaces(schema, type) {
	const interfaces = type.interface || type.interfaces || type.implements;
	if (!interfaces) {
		return type.fields;
	}
	const defaultFields = {};

	_.castArray(interfaces)
		.map(name => schema.interfaces[name] && schema.interfaces[name].fields)
		.filter(Boolean)
		.forEach((interfaceFields) => {
			// Assuming interfaces don't have conflicting fields
			Object.assign(defaultFields, interfaceFields);
		});

	return _.mergeWith(defaultFields, type.fields, mergeFields);
}

function collectDependenciesUtil(schema, allInterfaces, interfaceName, processing = {}) {
	if (processing[interfaceName]) throw new Error(`Cyclic dependencies at interface "${interfaceName}"`);

	const dependencies = [];
	const _interface = schema.interfaces[interfaceName];

	if (_interface === undefined) {
		if (allInterfaces.includes(interfaceName)) return [];
		throw new Error(`Interface "${interfaceName}" is not defined`);
	}

	dependencies.push(interfaceName);

	processing[interfaceName] = true;

	_.forEach(_interface.extends, (name) => {
		dependencies.push(...collectDependenciesUtil(schema, allInterfaces, name, processing));
	});

	delete processing[interfaceName];
	return _.uniq(dependencies);
}

class Schema {
	constructor(schema, resolvers, options = {}) {
		if (!schema) {
			throw new Error('No schema provided');
		}

		this.originalSchema = _.castArray(schema);
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
		schemaNames = _.castArray(schemaNames);

		if (!schemaNames.includes(this.defaultSchemaName)) {
			schemaNames.push(this.defaultSchemaName);
		}

		schemaNames.forEach((schemaName) => {
			this.schemas[schemaName] = {
				name: schemaName,
				types: {
					Query: {
						name: 'Query',
						description: 'The query root of this GraphQL interface.',
						fields: {},
						schema: schemaNames,
					},
					Mutation: {
						name: 'Mutation',
						description: 'The mutation root of this GraphQL interface.',
						fields: {},
						schema: schemaNames,
					},
					Subscription: {
						name: 'Subscription',
						description: 'The subscription root of this GraphQL interface.',
						fields: {},
						schema: schemaNames,
					},
				},
				inputTypes: {},
				enums: {},
				interfaces: {},
				scalars: {},
				unions: {},
				fragments: {},
			};
		});

		this.allSchemaItems = this.schemas[this.defaultSchemaName];
	}

	handleSchemaItem(schemaItem, itemName = null) {
		if (!_.isPlainObject(schemaItem)) {
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

			case 'fragment':
				schemaItems.fragments[itemName] = schemaItem;
				break;

			default:
				throw new Error(`Unknown graphql base type ${schemaItem.graphql}`);
		}
	}

	// eslint-disable-next-line
	getGraphqlTypeFromName(schema, typeName) {
		const lowerTypeName = typeName.toLowerCase();

		let type = null;

		if (lowerTypeName in defaultScalars) {
			type = {_graphql: defaultScalars[lowerTypeName]};
		}
		else if (typeName in schema.scalars) {
			type = schema.scalars[typeName];
		}
		else if (typeName in schema.enums) {
			type = schema.enums[typeName];
		}
		else if (typeName in schema.interfaces) {
			type = schema.interfaces[typeName];
		}
		else if (typeName in schema.inputTypes) {
			type = schema.inputTypes[typeName];
		}
		else if (typeName in schema.types) {
			type = schema.types[typeName];
		}
		else if (typeName in schema.unions) {
			type = schema.unions[typeName];
		}
		else if (typeName in defaultTypes) {
			type = {_graphql: defaultTypes[typeName]};
		}

		if (!type) {
			throw new Error(`Unknown type ${typeName}`);
		}

		return type._graphql;
	}

	// eslint-disable-next-line
	getTypeName(type) {
		const regex = /[a-zA-Z0-9_]+/;
		const matches = type.match(regex);
		return matches && matches[0];
	}

	schemaHasType(schema, type) {
		if (!type || typeof type !== 'string') {
			return true;
		}

		const typeName = this.getTypeName(type);
		if (!typeName) return false;

		return (
			(typeName.toLowerCase() in defaultScalars) ||
			(typeName in defaultTypes) ||
			(typeName in schema.scalars) ||
			(typeName in schema.enums) ||
			(typeName in schema.interfaces) ||
			(typeName in schema.inputTypes) ||
			(typeName in schema.types) ||
			(typeName in schema.unions)
		);
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
			graphqlType = new GraphQLNonNull(graphqlType);
		}

		if (isDoubleList) {
			graphqlType = new GraphQLList(new GraphQLList(graphqlType));
		}
		else if (isList) {
			graphqlType = new GraphQLList(graphqlType);
		}

		if (isListNonNull) {
			graphqlType = new GraphQLNonNull(graphqlType);
		}

		return graphqlType;
	}

	parseTypes(schema, types) {
		return _.filter(_.map(types, type => this.parseType(schema, type)));
	}

	handleSchemaEntry(schemaEntry) {
		if (_.isPlainObject(schemaEntry)) {
			if (schemaEntry.graphql) {
				this.handleSchemaItem(schemaEntry);
				return;
			}

			_.forEach(schemaEntry, (schemaItem, itemName) => {
				this.handleSchemaItem(schemaItem, itemName);
			});
		}
		else if (_.isArray(schemaEntry)) {
			_.forEach(schemaEntry, (schemaItem) => {
				this.handleSchemaItem(schemaItem);
			});
		}
		else {
			throw new Error(`Unknown schema entry ${schemaEntry}`);
		}
	}

	separateSchemaItems() {
		this.originalSchema.forEach((schemaEntry) => {
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

		schemaNames = _.castArray(schemaNames);

		if (!schemaNames.includes(schemaName)) {
			return false;
		}

		const types = schemaItem.interface ||
			schemaItem.interfaces ||
			schemaItem.implements ||
			schemaItem.type;

		if (_.isArray(types)) {
			for (const type of types) {
				if (!this.schemaHasType(schema, type)) return false;
			}

			return true;
		}

		return this.schemaHasType(schema, types);
	}

	// eslint-disable-next-line
	makeRelayConnection(schema, schemaItem) {
		const relayConnection = schemaItem.relayConnection;
		if (!relayConnection) return;

		const typeName = schemaItem.name;

		const connectionName = `${typeName}Connection`;
		const edgeName = `${typeName}Edge`;

		const edgeFields = {
			cursor: 'String!',
			node: typeName,
		};

		// relayConnection.edgeFields can be an object
		// in case we want to add extra fields to the edge schema
		// eg. to add extra field to edge => relayConnection: {edgeFields: {title: 'String!'}}
		if (relayConnection.edgeFields) {
			_.merge(edgeFields, schemaItem.relayConnection.edgeFields);
		}

		if (!(edgeName in schema.types)) {
			schema.types[edgeName] = {
				name: edgeName,
				description: 'An edge in a connection',
				fields: edgeFields,
			};
		}

		const connectionFields = {
			edges: `[${edgeName}]`,
			nodes: `[${typeName}]`,
			pageInfo: 'PageInfo!',
			totalCount: 'Int!',
		};

		// relayConnection.fields can be an object
		// in case we want to add extra fields to the edge schema
		// eg. to add extra field to edge => relayConnection: {fields: {timeTaken: 'Int'}}
		if (relayConnection.fields) {
			_.merge(connectionFields, schemaItem.relayConnection.fields);
		}

		if (!(connectionName in schema.types)) {
			schema.types[connectionName] = {
				name: connectionName,
				description: `A list of ${typeName}`,
				fields: connectionFields,
			};
		}
	}

	collectGraphqlTypeInSchema(schema, name) {
		const schemaItems = this.schemas[this.defaultSchemaName][name];

		_.forEach(schemaItems, (schemaItem) => {
			if (this.shouldSchemaContain(schema, schemaItem)) {
				schema[name][schemaItem.name] = schemaItem;

				if (name === 'types' || name === 'interfaces') {
					this.makeRelayConnection(schema, schemaItem);
				}
			}
		});
	}

	collectSingleInterfaceDependencies(schema, interfaceName) {
		let allInterfaces = this.schemas[this.defaultSchemaName].interfaces;
		allInterfaces = _.map(allInterfaces, i => i.name);

		return collectDependenciesUtil(schema, allInterfaces, interfaceName);
	}

	collectInterfaceDependencies(schema, interfaces) {
		const dependencies = [];
		interfaces = _.castArray(interfaces);
		interfaces.forEach((name) => {
			dependencies.push(...this.collectSingleInterfaceDependencies(schema, name));
		});
		return _.uniq(dependencies);
	}

	parseGraphqlField(schema, field, resolve) {
		const schemaContainsField = this.shouldSchemaContain(schema, field, {includeByDefault: true});
		if (!schemaContainsField) return false;

		let fieldResolve = resolve || field.resolve;
		if (fieldResolve) {
			// In case of subscriptions resolve might be an object, we need to handle for that case
			if (typeof fieldResolve === 'function') {
				fieldResolve = {resolve: fieldResolve};
			}
			else if (typeof fieldResolve !== 'object') {
				throw new Error('resolver must be an object or a function');
			}

			// handle filter in case of subscriptions
			if (fieldResolve.subscribe && fieldResolve.filter) {
				// since we are changing fieldResolve, we need to clone it
				fieldResolve = _.clone(fieldResolve);

				fieldResolve.subscribe = withFilter(
					fieldResolve.subscribe,
					fieldResolve.filter
				);

				delete fieldResolve.filter;
			}
		}


		if (typeof field === 'string') {
			const graphqlType = this.parseType(schema, field);
			if (!graphqlType) return null;

			const graphqlField = {
				type: graphqlType,
			};

			if (fieldResolve) {
				Object.assign(graphqlField, fieldResolve);
			}

			return graphqlField;
		}

		const graphqlType = this.parseType(schema, field.type);
		if (!graphqlType) return null;

		const graphqlField = {
			...field,
			type: graphqlType,
		};

		if (field.description) {
			graphqlField.description = field.description;
		}

		if (field.default !== undefined) {
			if (_.isFunction(field.default)) {
				graphqlField.defaultValue = field.default();
			}
			else {
				graphqlField.defaultValue = field.default;
			}
		}

		if (field.deprecationReason) {
			graphqlField.deprecationReason = field.deprecationReason;
		}

		if (fieldResolve) {
			Object.assign(graphqlField, fieldResolve);
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
			args = _.cloneDeep(args);
			let typeFields;
			const type = schema.types[typeName] || schema.interfaces[typeName];

			if (type) {
				typeFields = getMergedTypeFieldsWithInterfaces(schema, type);

				// if the type is a connection
				// then also consider the fields of the connection type in $default
				const matches = typeName.match(/(.+)Connection$/);
				if (matches) {
					const connectionTypeName = matches[1];
					const connectionType = schema.types[connectionTypeName] ||
						schema.interfaces[connectionTypeName];
					const connectionFields = getMergedTypeFieldsWithInterfaces(schema, connectionType);

					if (connectionType) {
						typeFields = _.assign({}, typeFields, connectionFields);
					}
				}
			}
			_.forEach(args.$default, (argName) => {
				// handle paging args
				if (argName === '$paging') {
					_.defaults(args, defaultArgs.pagingArgs);
					return;
				}

				// handle order args
				if (argName === '$order') {
					_.defaults(args, defaultArgs.orderArgs);
					return;
				}
				if (argName === '$sort') {
					_.defaults(args, defaultArgs.sortArgs);
					return;
				}

				if (!type || !typeFields) return;

				const isRequired = argName.includes('!');
				argName = argName.replace('!', '');

				if (argName in args) return;
				if (!(argName in typeFields)) return;

				let field = typeFields[argName];
				if (typeof field === 'string') {
					if (isRequired) {
						// add required if not there
						if (!field.includes('!')) {
							field += '!';
						}
					}
					else {
						// remove required
						field = field.replace(/!$/, '');
					}
				}
				else {
					field = _.clone(field);

					// remove required
					if (typeof field.type === 'string') {
						if (isRequired) {
							// add required if not there
							if (!field.type.includes('!')) {
								field.type += '!';
							}
						}
						else {
							// remove required
							field.type = field.type.replace(/!$/, '');
						}
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

		_.forEach(fields, (field, fieldName) => {
			const resolve = (
				parentName &&
				this.resolvers[parentName] &&
				this.resolvers[parentName][fieldName]
			);
			const parsedField = this.parseGraphqlField(schema, field, resolve);
			if (!parsedField) return;

			fieldName = field.name || fieldName;
			parsedFields[fieldName] = parsedField;
		});

		return parsedFields;
	}

	parseFragmentFields(fields) {
		const fieldsString = _.castArray(fields).map((field) => {
			if (typeof field === 'string') return field;
			let str = '';
			if (field.alias) { str += `${field.alias} : ` }
			str += field.name;

			if (field.args) {
				str += toGqlArg(field.args, {roundBrackets: true});
			}

			if (field.fields) {
				str += `{ ${this.parseFragmentFields(field.fields)} }`;
			}
			return str;
		}).join('\n');

		return `${fieldsString}`;
	}

	parseGraphqlEnumValue(schema, value, name) {
		const schemaContainsField = this.shouldSchemaContain(schema, value, {includeByDefault: true});
		if (!schemaContainsField) return null;

		if (typeof value === 'string') {
			return {value};
		}

		const enumValue = ('value' in value) ? value.value : name;

		return {
			value: enumValue,
			description: value.description,
			deprecationReason: value.deprecationReason,
		};
	}

	parseGraphqlEnumValues(schema, values) {
		const parsedValues = {};

		_.forEach(values, (value, name) => {
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

		scalar._graphql = new GraphQLScalarType({
			name: scalar.name,
			description: scalar.description,
			serialize: scalar.serialize || identity,
			parseValue: scalar.parseValue || identity,
			parseLiteral: scalar.parseLiteral,
		});
	}

	parseGraphqlEnum(schema, schemaItem) {
		const values = this.parseGraphqlEnumValues(schema, schemaItem.values);
		schemaItem._graphql = new GraphQLEnumType({
			name: schemaItem.name,
			description: schemaItem.description,
			values,
		});
		return _.mapValues(values, (v, name) => new GqlEnum(name));
	}

	parseGraphqlInterface(schema, schemaItem) {
		const resolveType = this.resolvers[schemaItem.name] &&
			this.resolvers[schemaItem.name].__resolveType;

		const dependencies = this.collectSingleInterfaceDependencies(schema, schemaItem.name);

		const fields = {};

		// Reverse iteration is done to merge fields according to hierarchy
		// For ex. if B extends A then to get B's fields, merge B's fields into A's not the other way.
		// Hence overrided fields will not be affected
		for (let i = dependencies.length - 1; i >= 0; i--) {
			const _interface = schema.interfaces[dependencies[i]];
			Object.assign(fields, _interface.fields);
		}

		schemaItem._graphql = new GraphQLInterfaceType({
			name: schemaItem.name,
			description: schemaItem.description,
			fields: () => this.parseGraphqlFields(schema, fields, schemaItem.name),
			resolveType: resolveType || schemaItem.resolveType,
		});
	}

	parseGraphqlInputType(schema, inputType) {
		inputType._graphql = new GraphQLInputObjectType({
			name: inputType.name,
			description: inputType.description,
			fields: () => this.parseGraphqlFields(schema, inputType.fields),
		});
	}

	parseGraphqlType(schema, type) {
		const isTypeOf = this.resolvers[type.name] &&
			this.resolvers[type.name].__isTypeOf;
		let interfaces = type.interface || type.interfaces || type.implements;
		if (interfaces) {
			interfaces = this.collectInterfaceDependencies(schema, interfaces);

			/** To be used in @method getMergedTypeFieldsWithInterfaces */
			type.interfaces = interfaces;
			delete type.interface;
			delete type.implements;
		}

		const graphqlType = {
			name: type.name,
			description: type.description,
			fields: () => {
				const fields = this.parseGraphqlFields(
					schema,
					getMergedTypeFieldsWithInterfaces(schema, type),
					type.name
				);

				if (_.isEmpty(fields)) {
					return {
						noop: {
							type: GraphQLString,
							description: 'Placeholder Field',
							resolve: () => 'noop',
						},
					};
				}

				return fields;
			},
			isTypeOf: isTypeOf || type.isTypeOf,
		};

		if (interfaces) {
			graphqlType.interfaces = () => this.parseTypes(schema, interfaces);
		}

		type._graphql = new GraphQLObjectType(graphqlType);
	}

	parseGraphqlUnion(schema, union) {
		const resolveType = this.resolvers[union.name] &&
			this.resolvers[union.name].__resolveType;

		union._graphql = new GraphQLUnionType({
			name: union.name,
			description: union.description,
			types: () => this.parseTypes(schema, union.types),
			resolveType: resolveType || union.resolveType,
		});
	}

	parseGraphqlFragment(schema, fragment) {
		const type = this.getTypeName(fragment.type);
		if (!schema.types[type]) throw new Error(`Type for fragment does not exist, ${type}`);
		return new GqlFragment({
			name: fragment.name,
			type,
			fields: this.parseFragmentFields(fragment.fields),
		});
	}

	parseGraphqlScalars(schema, scalars) {
		_.forEach(scalars, scalar => this.parseGraphqlScalar(schema, scalar));
	}

	parseGraphqlEnums(schema, enums) {
		const gqlEnumMap = {};
		_.forEach(enums, (schemaItem) => {
			gqlEnumMap[schemaItem.name] = this.parseGraphqlEnum(schema, schemaItem);
		});
		return gqlEnumMap;
	}

	parseGraphqlInterfaces(schema, interfaces) {
		_.forEach(interfaces, schemaItem => this.parseGraphqlInterface(schema, schemaItem));
	}

	parseGraphqlInputTypes(schema, inputTypes) {
		_.forEach(inputTypes, inputType => this.parseGraphqlInputType(schema, inputType));
	}

	parseGraphqlTypes(schema, types) {
		_.forEach(types, type => this.parseGraphqlType(schema, type));
	}

	parseGraphqlUnions(schema, unions) {
		_.forEach(unions, union => this.parseGraphqlUnion(schema, union));
	}

	parseGraphqlFragments(schema, fragments) {
		return _.mapValues(fragments, fragment => this.parseGraphqlFragment(schema, fragment));
	}

	parseGraphqlSchema(schema) {
		this.collectGraphqlTypeInSchema(schema, 'scalars');
		this.collectGraphqlTypeInSchema(schema, 'enums');
		this.collectGraphqlTypeInSchema(schema, 'interfaces');
		this.collectGraphqlTypeInSchema(schema, 'inputTypes');
		this.collectGraphqlTypeInSchema(schema, 'types');
		this.collectGraphqlTypeInSchema(schema, 'unions');
		this.collectGraphqlTypeInSchema(schema, 'fragments');

		this.parseGraphqlScalars(schema, schema.scalars);
		const enums = this.parseGraphqlEnums(schema, schema.enums);
		this.parseGraphqlInterfaces(schema, schema.interfaces);
		this.parseGraphqlInputTypes(schema, schema.inputTypes);
		this.parseGraphqlTypes(schema, schema.types);
		this.parseGraphqlUnions(schema, schema.unions);
		const fragments = this.parseGraphqlFragments(schema, schema.fragments);

		const graphqlSchema = new GraphQLSchema({
			query: schema.types.Query._graphql,
			mutation: schema.types.Mutation._graphql,
			subscription: schema.types.Subscription._graphql,
		});

		graphqlSchema._data = {
			fragments,
			enums,
		};

		if (this.options.resolverValidationOptions) {
			assertResolveFunctionsPresent(graphqlSchema, this.options.resolverValidationOptions);
		}

		if (!this.options.allowUndefinedInResolve) {
			addCatchUndefinedToSchema(graphqlSchema);
		}

		if (this.options.logger) {
			addErrorLoggingToSchema(graphqlSchema, this.options.logger);
		}

		return graphqlSchema;
	}

	parseGraphqlSchemas() {
		const finalSchemas = {};

		_.forEach(this.schemas, (schema, schemaName) => {
			finalSchemas[schemaName] = this.parseGraphqlSchema(schema);
		});

		return finalSchemas;
	}
}

function makeSchemas(schemas, resolvers, options = {}) {
	return new Schema(schemas, resolvers, options).parseGraphqlSchemas();
}

export {
	makeSchemas,
	Schema,
};
