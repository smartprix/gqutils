import {PubSub} from 'graphql-subscriptions';
import {GraphQLSchema} from 'graphql';

declare module 'gqutils' {
	type schemaType = string[] | string;
	/**
	 * resolve (optional): resolver for this field
	 * this can also be defined in resolvers
	 */
	type resolveType = (root: any, args: any, ctx: any, info: any) => {};

	/** $paging is used for paging parameters (first, after, last, before) */
	type pagingArg = '$paging';

	/** $order is used for order parameters (orderBy & orderDirection) */
	type orderArg = '$order';

	interface GQUtilsBaseSchema {
		/**
		 * if name is not given it'll be taken from the object where it is exported
		 * eg. export {schema: {Employee}}
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
	}

	/**
	 * key is field's name, value is field's type
	 * You can use ! for non null, and [] for list same as graphql in value
	 */
	interface GQUtilsFields {
		[key: string]: string | {
			/** type (required): type of the field */
			type: string;
			description?: string;
			default?: any;
			schema?: schemaType;
			deprecationReason?: string;
			resolve?: resolveType;

			/**
			 * args (optional): arguments that this field takes
			 * NOTE: args are defined as the same way fields are
			 */
			args?: GQUtilsFields & {
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
		}

	}
	
	export interface GQUtilsTypeSchema extends GQUtilsBaseSchema {
		grapqhl: 'type';
		/**
		 * (default=false): generate a relay connection type automatically
		 * if this is true, a connection type (EmployeeConnection here) will be added to the schema
		 * relayConnection can also be an object with fields {edgeFields, fields}
		 * edgeFields and fields will be merged with EmployeeEdge and EmployeeConnection respectively
		 * eg. relayConnection: {
		 *     edgeFields: {title: 'String!'},
		 *     fields: {timeTaken: 'Int!'}
		 * }
		 */
		relayConnection?: boolean;
		/**
		 * interfaces this type implements
		 */
		interfaces?: string[];
		/**
		 * fields of the type
		 */
		fields: GQUtilsFields;
	}

	export interface GQUtilsInputSchema extends GQUtilsBaseSchema {
		grapqhl: 'input';
		/**
		 * fields of the type
		 */
		fields: GQUtilsFields;
	}

	export interface GQUTilsUnionSchema extends GQUtilsBaseSchema {
		grapqhl: 'union';
		/**  types (required): types that this union contains */
		types: string[];
		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	export interface GQUtilsInterfaceSchema extends GQUtilsBaseSchema {
		graphql: 'interface';
		/**
		 * fields of the interface
		 */
		fields: GQUtilsFields;

		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	export interface GQUtilsEnumSchema extends GQUtilsBaseSchema {
		graphql: 'enum';
		values: {
			[key:string]: string | number | boolean | {
				value: any;
				description?: string;
				deprecationReason?: string;
				schema?: string[];
			};
		}
		/** resolveType (optional): function for determining which type is actually used when the value is resolved */
		resolveType?: (value: any, info: any) => string;
	}

	export interface GQUtilsScalarSchema extends GQUtilsBaseSchema {
		/** Define either resolve or (serialize, parseValue, parseLiteral) */
		graphql: 'scalar';
		values: {
			[key:string]: string | number | boolean | {
				value: any;
				description?: string;
				deprecationReason?: string;
				schema?: string[];
			};
		}
		/** 
		 * resolve (required/optional): Already defined graphql scalar you can resolve it with
		 * if resolve is not given then, serialize, parseValue, parseLiteral must be given
		*/
		resolve?: (value: any, info: any) => string;

		/** serialize (optional, default=identity function): send value to client */
		serialize?: (value: any) => any,

		/** parseValue(optional, default=identity function): parse value coming from client */
		parseValue?: (value: any) => any,

		/** parseLiteral (required/optional): parse ast tree built after value coming from client */
		parseLiteral?: (ast: any) => any,
	}

	export interface GQUtilsQuerySchema extends GQUtilsBaseSchema {
		graphql: 'query' | 'mutation' | 'subscription';
		/** type (required): type that this query returns */
		type: string;
		/**
		 * resolve (optional): resolver for this query
		 * this can also be defined in resolvers
		 */
		resolve?: resolveType;

		args?: GQUtilsFields;
	}

	export type GQUtilsSchemaType = GQUtilsTypeSchema | GQUtilsInputSchema | GQUTilsUnionSchema | GQUtilsInterfaceSchema | GQUtilsEnumSchema | GQUtilsScalarSchema | GQUtilsQuerySchema;

	interface commonOptions {
		defaultSchemaName?: string;
		schema?: string[];
		schemas?: string[];
		logger?: Partial<Console>;
		allowUndefinedInResolve?: boolean;
		resolverValidationOptions?: any;
	}

	export function makeSchemaFromModules(modules: (string | {schema: any, resolvers: any})[], opts?:  commonOptions & {
		baseFolder?: string;
		generateTypes?: boolean;
		outputPath?: string;
		/**
		 * Type name for context, shopuld be declared elsewhere
		 */
		contextType?: string;
	}): {
		schema: {[key: string]: GraphQLSchema};
		schemas: {[key: string]: GraphQLSchema};
		defaultSchema: GraphQLSchema;
		pubsub: PubSub; 
	};

	export function formatError(error: Error): Error & {fields: {
		[key: string]: {message: string, keyword: string}
	}};
	export function humanizeError(field: string, error: any): {message: string};

	export function getConnectionResolver<M, T extends {[key: string]: any}>(query: Promise<M>, args, options?: {resolvers?: T}): T & {
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
	export function getIdFromCursor(cursor: number | string): number;
	export function getCursorFromId(id: number | string): string;

	export function makeSchemas(schemas: {[key: string]: GQUtilsSchemaType}[], resolvers: {[key: string]: resolveType}[], options?: commonOptions): {[key:string]: GraphQLSchema};

	export class Schema {
		constructor(schemas: {[key: string]: GQUtilsSchemaType}[], resolvers: {[key: string]: resolveType}[], options?: commonOptions)

		parseGraphqlSchemas(): {[key: string]: GraphQLSchema};
		parseGraphqlSchema(schema: string): GraphQLSchema;
	}
}