import {PubSub} from 'graphql-subscriptions';
import {GraphQLSchema} from 'graphql';
import {IResolverValidationOptions} from 'graphql-tools';
import {GenerateTypescriptOptions} from 'graphql-schema-typescript'

declare module 'gqutils' {
	type schemaType = string[] | string;
	/**
	 * resolve (optional): resolver for this field
	 * this can also be defined in resolvers
	 */
	type resolveType = (root: any, args: any, ctx: any, info: any) => any;

	/** $paging is used for paging parameters (first, after, last, before) */
	type pagingArg = '$paging';

	/** $order is used for order parameters (orderBy & orderDirection) */
	type orderArg = '$order';

	interface GQUtilsBaseSchema {
		/**
		 * if name is not given it'll be taken from the object where it is d
		 * eg. {schema: {Employee}}
		 */
		name?: string;
		/**
		 * description that'll displayed in docs
		 */
		description?: string;
		/**
		 * schemas that this type is available in
		 * if schema is not given, it won't be available in any schema
		 */
		schema: schemaType;
		/**
		 * permissions, allow only these roles / permissions to access this
		 * NOTE: this is not currently implemented in gqutils, so your app has to implement it itself
		 */
		permissions: string[];
	}

	/**
	 * key is field's name, value is field's type
	 * You can use ! for non null, and [] for list same as graphql in value
	 */
	interface GQUtilsFieldsBase {
		/** type (required): type of the field */
		type: string;
		description?: string;
		default?: any;
		schema?: schemaType;
		deprecationReason?: string;
		resolve?: resolveType;
	}

	type GQUtilsArgs = {
		/**
		 * Should be string or object, except when key is '$default' then it is string array
		 */
		[keys: string]: string | string[] | GQUtilsFieldsBase;
	} & {
		/**
		 * $default is special
		 * fields defined in $default will be taken from parent's (TeamConnection's) fields
		 * fields in $default will not have required condition even if mentioned in the type
		 * to enforce required condition add `!` to the field's name
		 * $paging is used for paging parameters (first, after, last, before)
		 * $order is used for order parameters (orderBy & orderDirection)
		 */
		$default?: (pagingArg | orderArg | string)[];
	};

	type GQUtilsFields = {
		[key: string]: string | (GQUtilsFieldsBase & {
			/**
			 * args (optional): arguments that this field takes
			 * NOTE: args are defined as the same way fields are
			 */
			args?: GQUtilsArgs;
		})
	}

	interface GQUtilsTypeSchema extends GQUtilsBaseSchema {
		graphql: 'type';
		/**
		 * (default=false): generate a relay connection type automatically
		 * if this is true, a connection type will be added to the schema
		 * relayConnection can also be an object with fields {edgeFields, fields}
		 * edgeFields and fields will be merged with Edge and Connection respectively
		 * eg. relayConnection: {
		 *     edgeFields: {title: 'String!'},
		 *     fields: {timeTaken: 'Int!'}
		 * }
		 */
		relayConnection?: boolean | {
			edgeFields: GQUtilsFields;
			fields: GQUtilsFields;
		};
		/**
		 * interfaces this type implements
		 */
		interfaces?: string[];
		/**
		 * fields of the type
		 */
		fields: GQUtilsFields;
	}

	interface GQUtilsInputSchema extends GQUtilsBaseSchema {
		graphql: 'input';
		/**
		 * fields of the type
		 */
		fields: GQUtilsFields;
	}

	interface GQUTilsUnionSchema extends GQUtilsBaseSchema {
		graphql: 'union';
		/**  types (required): types that this union contains */
		types: string[];
		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	interface GQUtilsInterfaceSchema extends GQUtilsBaseSchema {
		graphql: 'interface';
		/**
		 * fields of the interface
		 */
		fields: GQUtilsFields;

		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	interface valuesType {
		[key: string]: string | number | boolean | {
			value: any;
			description?: string;
			deprecationReason?: string;
			schema?: string[];
		};
	}

	interface GQUtilsEnumSchema extends GQUtilsBaseSchema {
		graphql: 'enum';
		values: valuesType;
		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	interface GQUtilsScalarSchema extends GQUtilsBaseSchema {
		/** Define either resolve or (serialize, parseValue, parseLiteral) */
		graphql: 'scalar';
		values: valuesType;
		/**
		 * resolve (required/optional): Already defined graphql scalar you can resolve it with
		 * if resolve is not given then, serialize, parseValue, parseLiteral must be given
		*/
		resolve?: (value: any, info: any) => string;
	}

	interface GQUtilsScalarSchemaAlternate extends GQUtilsBaseSchema {
		/** Define either resolve or (serialize, parseValue, parseLiteral) */
		graphql: 'scalar';
		values: valuesType;

		/** serialize (optional, default=identity function): send value to client */
		serialize?: (value: any) => any,

		/** parseValue(optional, default=identity function): parse value coming from client */
		parseValue?: (value: any) => any,

		/** parseLiteral (required/optional): parse ast tree built after value coming from client */
		parseLiteral?: (ast: any) => any,
	}


	interface GQUtilsQuerySchema extends GQUtilsBaseSchema {
		graphql: 'query' | 'mutation' | 'subscription';
		/** type (required): type that this query returns */
		type: string;
		/**
		 * resolve (optional): resolver for this query
		 * this can also be defined in resolvers
		 */
		resolve?: resolveType;

		args?: GQUtilsArgs;
	}

	type GQUtilsSchema = GQUtilsTypeSchema | GQUtilsInputSchema | GQUTilsUnionSchema | GQUtilsInterfaceSchema | GQUtilsEnumSchema | GQUtilsScalarSchema | GQUtilsScalarSchemaAlternate | GQUtilsQuerySchema;

	interface commonOptions {
		defaultSchemaName?: string;
		schema?: string[];
		schemas?: string[];
		logger?: Partial<Console>;
		allowUndefinedInResolve?: boolean;
		resolverValidationOptions?: IResolverValidationOptions;
	}

	interface gqlSchemas {
		schema: schemaMap;
		schemas: schemaMap;
		defaultSchema: GraphQLSchema;
		pubsub: PubSub;
	}

	type schemaMap = {[key: string]: GraphQLSchema};
	type gqlConfig = commonOptions & {
		contextType?: string,
		generateTypeOptions?: GenerateTypescriptOptions,
		schemaDirectory?: string,
	};

	function makeSchemaFromModules(modules: (string | {schema: any, resolvers: any})[], opts?: commonOptions): gqlSchemas;
	function makeSchemaFromDirectory(directory: string, opts?: commonOptions): gqlSchemas;
	function makeSchemaFromConfig(opts?: commonOptions): gqlSchemas;
	function getConfig(): gqlConfig;

	/**
	 * Generate type definitions from module ''graphql-schema-typescript'
	 * @see https://github.com/dangcuuson/graphql-schema-typescript#readme
	 * @param graphqlSchemas Map of generated schemas
	 * @param opts provide options for generated types lik
	 * @param opts.options Options to pass to original module
	 */
	function generateTypesFromSchema(graphqlSchemas: schemaMap, opts?: {contextType?: string, outputPath?: string, schema?: string | string[], options?: GenerateTypescriptOptions}): Promise<void>

	function formatError(error: Error): Error & {fields: {
		[key: string]: {message: string, keyword: string}
	}};
	function humanizeError(field: string, error: any): {message: string};

	function getConnectionResolver<M, T extends {[key: string]: any}>(query: Promise<M>, args, options?: {resolvers?: T}): T & {
		nodes: () => Promise<M>,
		edges: () => Promise<{cursor: string, node: M}>,
		totalCount: () => Promise<number>,
		pageInfo: () => Promise<{
			startCursor: string | null,
			endCursor: string | null,
			hasPreviousPage: boolean,
			hasNextPage: boolean,
			edgeCount: number,
		}>,
	};
	function getIdFromCursor(cursor: number | string): number;
	function getCursorFromId(id: number | string): string;

	function makeSchemas(schemas: {[key: string]: GQUtilsSchema}[], resolvers: {[key: string]: resolveType}[], options?: commonOptions): {[key:string]: GraphQLSchema};

	class Schema {
		constructor(schemas: {[key: string]: GQUtilsSchema}[], resolvers: {[key: string]: resolveType}[], options?: commonOptions)

		parseGraphqlSchemas(): schemaMap;
		parseGraphqlSchema(schema: string): GraphQLSchema;
	}
}
