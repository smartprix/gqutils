import {PubSub} from 'graphql-subscriptions';
import {GraphQLSchema} from 'graphql';
import {IResolverValidationOptions} from 'graphql-tools';
import {GenerateTypescriptOptions} from 'graphql-schema-typescript';
import graphqlListFields = require('graphql-list-fields');
import {Cache, response} from 'sm-utils';

declare module 'gqutils' {
	type schemaType = string[] | string;
	/**
	 * resolve (optional): resolver for this field
	 * this can also be defined in resolvers
	 */
	type resolveType = (root: any, args: any, ctx: any, info: any) => any;

	/** $paging is used for paging parameters (first, after, last, before) */
	type pagingArg = '$paging';

	/** $order is used for order parameters (orderBy & orderDirection (Enum of ASC, DESC)) */
	type orderArg = '$order';

	/** $sort is used for order parameters (order & sort (String type)) */
	type sortArg = '$sort';

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
		permissions?: string[];
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
		 * - $paging is used for paging parameters (first, after, last, before)
		 * - $order is used for order parameters (orderBy & orderDirection)
		 * - $sort is used for order params (sort & order)
		 * **NOTE**: $sort uses String type for order while $order uses Enum
		 */
		$default?: (pagingArg | orderArg | sortArg | string)[];
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

	interface GQUtilsTypeSchema<I = string> extends GQUtilsBaseSchema {
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
			edgeFields?: GQUtilsFields;
			fields?: GQUtilsFields;
		};
		/**
		 * interfaces this type implements
		 */
		interfaces?: I[];
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

	interface GQUtilsInterfaceSchema<I = string> extends GQUtilsBaseSchema {
		graphql: 'interface';

		/** Extend other interface(s) */
		extends?: I[];

		/** fields of the interface */
		fields: GQUtilsFields;

		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	interface ValuesType {
		[key: string]: string | number | boolean | {
			value: any;
			description?: string;
			deprecationReason?: string;
			schema?: string[];
		};
	}

	interface GQUtilsEnumSchema extends GQUtilsBaseSchema {
		graphql: 'enum';
		values: ValuesType;
		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	interface GQUtilsScalarSchema extends GQUtilsBaseSchema {
		/** Define either resolve or (serialize, parseValue, parseLiteral) */
		graphql: 'scalar';
		values: ValuesType;
		/**
		 * resolve (required/optional): Already defined graphql scalar you can resolve it with
		 * if resolve is not given then, serialize, parseValue, parseLiteral must be given
		*/
		resolve?: (value: any, info: any) => string;
	}

	interface GQUtilsScalarSchemaAlternate extends GQUtilsBaseSchema {
		/** Define either resolve or (serialize, parseValue, parseLiteral) */
		graphql: 'scalar';
		values: ValuesType;

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

	type fragmentField = string | Array<string | FragmentFieldObj>

	interface FragmentFieldObj {
		name: string;
		/** If you want to alias the field, like: `name: fullName` */
		alias?: string;
		/** args for field, will be passed to `Gql.toGqlArg` */
		args?: {[arg: string]: any};
		/** If field type is itself aan object type */
		fields?: fragmentField;
	}

	interface GQUtilsFragmentSchema extends GQUtilsBaseSchema {
		graphql: 'fragment';
		/** On which type is this fragment supposed to be defined */
		type: string;
		fields: fragmentField;
	}

	type GQUtilsSchema<I = string> = GQUtilsTypeSchema<I> | GQUtilsInputSchema | GQUTilsUnionSchema | GQUtilsInterfaceSchema<I> | GQUtilsEnumSchema | GQUtilsScalarSchema | GQUtilsScalarSchemaAlternate | GQUtilsQuerySchema | GQUtilsFragmentSchema;

	interface CommonOptions {
		/** default is `default` */
		defaultSchemaName?: string;
		schema?: string[];
		schemas?: string[];
		logger?: Partial<Console>;
		allowUndefinedInResolve?: boolean;
		resolverValidationOptions?: IResolverValidationOptions;
	}

	interface GQUtilsFragment {
		name: string;
		type: string;
		fields: string;
	}

	type GQUtilsData = {
		fragments: {[fragmentName: string]: GqlFragment};
		enums: {[enumName: string]: GqlEnum};
	};

	interface GqlSchemas {
		schema: schemaMap;
		schemas: schemaMap;
		defaultSchema: GraphQLSchema;
		pubsub: PubSub;
		data: {[schemaName: string]: GQUtilsData};
	}
	type schemaMap = {[key: string]: GraphQLSchema};

	type gqlConfig = CommonOptions & {
		baseFolder?: string;
		contextType?: string,
		generateTypeOptions?: GenerateTypescriptOptions,
		schemaDirectory?: string,
	};

	/**
	 * @param modules if path, it is required relative to the basefolder
	 */
	function makeSchemaFromModules(modules: (string | {schema: any, resolvers: any})[], opts?: CommonOptions & {baseFolder?: string;}): GqlSchemas;
	/**
	 * make a graphql schema from a directory by reading all schema & resolvers from it
	 * Only supports exports of type:
	 * - export {schema}
	 * - export schema from
	 * - module.exports = {schema}
	 * - exports.schema =
	 * - Object.defineProperty(exports, "schema",
	 */
	function makeSchemaFromDirectory(directory: string, opts?: CommonOptions): GqlSchemas;
	/**
	 * If `schemaDirectory` is provided this uses `makeSchemaFromDirectory`
	 * If `modules` then `makeSchemaFromModules`
	 * @param opts Override default config read from config files (gqutils, sm-config, or package)
	 */
	function makeSchemaFromConfig(opts?: Partial<gqlConfig>): GqlSchemas;
	/**
	 * Get config from config files
	 * @param opts Overwrite some options
	 */
	function getConfig(opts?: Partial<gqlConfig>): gqlConfig;

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

	function toGqlArg(arg: any, opts?: string[] | {pick?: string[], curlyBrackets?: boolean, roundBrackets?: boolean}): string;

	interface ConnectionResolvers<M> {
		nodes: () => Promise<M[]>,
		edges: () => Promise<{cursor: string, node: M}[]>,
		totalCount: () => Promise<number>,
		pageInfo: () => Promise<{
			startCursor: string | null,
			endCursor: string | null,
			hasPreviousPage: boolean,
			hasNextPage: boolean,
			edgeCount: number,
		}>,
	}

	interface PagingParams {
		first?: number;
		last?: number;
		before?: number;
		after?: number;
	}

	/**
	 * @param args
	 * @param opts defaultLimit is 20 by default
	 */
	function getPagingParams(args: PagingParams, opts?: {defaultLimit?: number}): {limit: number, offset: number};
	function getConnectionResolver<M, T extends ConnectionResolvers<M>>(query: Promise<M[]>, args: PagingParams, options?: {resolvers?: Partial<T>}): T;
	function getIdFromCursor(cursor: number | string): number;
	function getCursorFromId(id: number | string): string;
	const getFieldNames: typeof graphqlListFields;
	/**
	 * returns true if field is a substring of any item in the fields array,
	 * false otherwise
	 */
	function includesField(field: string, fields: string[]): boolean;

	function makeSchemas(schemas: {[key: string]: GQUtilsSchema}[], resolvers: {[key: string]: resolveType}[], options?: CommonOptions): {[key:string]: GraphQLSchema};

	class Schema {
		constructor(schemas: {[key: string]: GQUtilsSchema}[], resolvers: {[key: string]: resolveType}[], options?: CommonOptions)

		static parseFragmentFields(fields: fragmentField): string;

		parseGraphqlSchemas(): schemaMap;
		parseGraphqlSchema(schema: string): GraphQLSchema;
	}

	class GqlEnum<V = any> {
		constructor(name: string, val?: V);
		value: Readonly<V>;
		name: Readonly<string>;
		toString(): string;
	}

	class GqlFragment implements GQUtilsFragment {
		constructor(fragment: GQUtilsFragment);
		name: Readonly<string>;
		type: Readonly<string>;
		fields: Readonly<string>;
		toString(): string;
		getName(): string;
		getDefinition(): string;
	}

	type gqlFragmentMap = {[key: string]: GqlFragment};
	type EnumMap = {[key: string]: GqlEnum}
	type gqlEnumMap = {[key: string]: EnumMap}

	interface SchemaConfigInput {
		validateGraphql?: boolean;
		/** Default is defaultSchemaName value */
		schemaName?: string;
		/**
		 * By default it uses `formatError` from `gqutils`.
		 * @param error Error object
		 * @param context The context passed to exec
		 */
		formatError?: (error: Error, context: any) => any;
	}


	interface RequestOptions {
		endpoint: string;
		token?: string;
		headers?: {[key: string]: string};
		cookies?: {[key: string]: string};
	}

	interface ApiInput extends RequestOptions {
		fragments?: gqlFragmentMap;
		enums?: gqlEnumMap;
	}

	interface ExecOptions {
		context?: any;
		cache?: {key: string, ttl?: number, forceUpdate?: boolean};
		variables?: {[key: string]: any};
		requestOptions?: Pick<RequestOptions, 'headers' | 'cookies'> & {[key: string]: string};
	}

	type _cacheOpts = {
		cache?: Cache;
	};

	abstract class Gql<FragmentsMap = gqlFragmentMap, EnumsMap = gqlEnumMap> {
		constructor(opts: _cacheOpts);

		static fromApi(opts: ApiInput & _cacheOpts): GqlApi;
		static fromConfig(opts: SchemaConfigInput & CommonOptions & _cacheOpts): GqlSchema;
		static fromSchemas(opts: SchemaConfigInput & GqlSchemas & _cacheOpts): GqlSchema;

		/**
		 * This just calls the constructor of GqlEnum
		 */
		static enum<V extends any>(name: string, value?: V): GqlEnum<V>;
		/**
		 * This parses the fields if they are in schema format and
		 * then calls the constructor of GqlFragment
		 */
		static fragment(fragment:  Pick<GQUtilsFragmentSchema, 'name' | 'fields' | 'type'>): GqlFragment;
		static tag(strings: TemplateStringsArray, ...args: any[]): string;
		static toGqlArg: typeof toGqlArg;

		abstract _getQueryResult(query: string, opts: Omit<ExecOptions, 'cache'>): Promise<any>;

		exec(query: string, opts?: ExecOptions): Promise<any>;
		getAll(query: string, opts?: ExecOptions): Promise<any>;
		get(query: string, opts: ExecOptions): Promise<any>;
		/**
		 * **NOTE:** Does not work if fragments are not present in schema/passed in constructor
		 *
		 * This automatically picks up the fragment from the generated schema
		 */
		fragment<key extends keyof FragmentsMap>(fragmentName: key): FragmentsMap[key];
		/**
		 * **NOTE:** Does not work if fragments are not present in schema/passed in constructor
		 */
		fragments: FragmentsMap;
		/**
		 * **NOTE:** Does not work if enums are not present in schema/passed in constructor
		 * @param name
		 */
		enum<key extends keyof EnumsMap>(name: key): EnumsMap[key];
		/**
		 * **NOTE:** Does not work if enums are not present in schema/passed in constructor
		 */
		enums: EnumsMap;
		tag(strings: TemplateStringsArray, ...args: any[]): string;
		/** Calls toGqlArg with roundBrackets true */
		arg: (arg: any, opts?: string[] | {pick?: string[]}) => string;
		toGqlArg: typeof toGqlArg;
	}

	class GqlApi<FragmentsMap = gqlFragmentMap, EnumsMap = gqlEnumMap> extends Gql<FragmentsMap, EnumsMap> {
		constructor(api: _cacheOpts & ApiInput);

		/** **NOTE**: Override this method to use your own http client */
		static postRequest(url: string, opts: {body: any, [key: string]: string} & Omit<RequestOptions, 'endpoint'>): Promise<any>;
		
		_getQueryResult(query: string, opts: Omit<ExecOptions, 'context' | 'cache'>): Promise<any>;
	}

	class GqlSchema<FragmentsMap = gqlFragmentMap, EnumsMap = gqlEnumMap> extends Gql<FragmentsMap, EnumsMap> {
		/** Provide either one of `config` or `schemas` */
		constructor(opts: _cacheOpts & {
			config?: SchemaConfigInput & CommonOptions;
			schemas?: SchemaConfigInput & GqlSchemas;
		});

		getSchemas(): schemaMap;
		getPubSub(): PubSub;
		getData(): {[schemaName: string]: GQUtilsData};

		_getQueryResult(query: string, opts: Omit<ExecOptions, 'cache' | 'requestOptions'>): Promise<any>;
	}
}
