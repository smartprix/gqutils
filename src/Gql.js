import _ from 'lodash';
import {parse, validate, execute} from 'graphql';
import {Connect, Str} from 'sm-utils';

import {
	formatError,
	toGqlArg,
	GqlEnum,
	GqlFragment,
} from './helpers';
import {makeSchemaFromConfig} from './makeSchemaFrom';

const ONE_DAY = 24 * 3600 * 1000;

class ApiError extends Error {}
class GraphqlError extends Error {}

/**
 * we are not using the inbuilt graphql function because it validates
 * the graphql, which is an expensive operation
 * return graphql(schema, query, rootValue, context, variables);
 * taken from:
 * @see https://github.com/graphql/graphql-js/blob/master/src/graphql.js
 */
function graphql({
	schema, query, context, variables, rootValue = null, validateGraphql = false,
}) {
	// parse
	let document;
	try {
		document = parse(query);
	}
	catch (syntaxError) {
		return Promise.resolve({errors: [syntaxError]});
	}

	if (validateGraphql) {
		const validationErrors = validate(schema, document);
		if (validationErrors.length > 0) {
			return Promise.resolve({errors: validationErrors});
		}
	}

	return execute(
		schema,
		document,
		rootValue,
		context,
		variables,
	);
}

class Gql {
	constructor(opts = {}) {
		if (opts.api) {
			if (!opts.api.endpoint) throw new ApiError('Api endpoint is not provided');

			this._api = _.defaults(opts.api, {
				headers: {},
				cookies: {},
			});
		}
		else if (opts.config || opts.schemas) {
			let config;
			if (opts.config) {
				config = opts.config;
				const makeResult = makeSchemaFromConfig(config);
				this._makeResult = makeResult;
			}
			else {
				config = opts.schemas;
				this._makeResult = opts.schemas;
			}
			const schemaName = config.schemaName !== undefined ?
				config.schemaName : (config.defaultSchemaName || 'default');
			const {schema, data} = this._makeResult;

			this._schemaName = schemaName;
			this._schema = schema[schemaName];
			this._fragments = data[schemaName].fragments;
			this._enums = data[schemaName].enums;
			this._validateGraphql = config.validateGraphql || false;
			this._formatError = config.formatError || formatError;
		}
		else throw new Error('Invalid options for Gql');

		this._cache = opts.cache;
	}

	static fromApi(opts) {
		return new Gql({api: opts, cache: opts.cache});
	}

	static fromConfig(opts) {
		return new Gql({config: opts, cache: opts.cache});
	}

	static fromSchemas(opts) {
		return new Gql({schemas: opts, cache: opts.cache});
	}

	getSchemas() {
		if (this._api) throw new Error('Invalid Method');
		return this._makeResult.schemas;
	}

	getData() {
		if (this._api) throw new Error('Invalid Method');
		return this._makeResult.data;
	}

	getPubSub() {
		if (this._api) throw new Error('Invalid Method');
		return this._makeResult.pubsub;
	}

	async _execApi(query, {variables = {}, requestOptions = {}} = {}) {
		let response = Connect
			.url(this._api.endpoint)
			.headers(this._api.headers)
			.cookies(this._api.cookies)
			.headers(requestOptions.headers)
			.cookies(requestOptions.cookies)
			.body({query, variables})
			.post();

		if (this._api.token) response.apiToken(this._api.token);

		response = await response;

		const result = Str.tryParseJson(response.body);

		if (response.statusCode !== 200) {
			const err = new ApiError(`${response.statusCode}, Invalid status code`);
			err.errors = result && result.errors;
			err.body = response.body;
			err.statusCode = response.statusCode;
			throw err;
		}

		if (!result) {
			const err = new ApiError('Invalid result from api');
			err.body = response.body;
			throw err;
		}

		if (!_.isEmpty(result.errors)) {
			const err = new ApiError('Errors in api response');
			err.errors = result.errors;
			throw err;
		}

		return result.data;
	}

	async _execGraphql(query, {context, variables = {}} = {}) {
		const result = await graphql({
			schema: this._schema,
			query,
			context,
			variables,
			validateGraphql: this._validateGraphql,
		});

		if (_.isEmpty(result.errors)) return result.data;

		let fields = {};
		const errors = result.errors;

		errors.forEach((error) => {
			error = this._formatError(error, context);
			Object.assign(fields, error.fields);
		});

		// no user errors sent by server
		if (!Object.keys(fields).length) {
			fields = {
				global: {
					message: 'Unknown Error',
					keyword: 'unknown',
				},
			};
		}

		const err = new GraphqlError(`[schema:${this._schemaName}] Error in graphQL api`);
		err.errors = errors;
		err.fields = fields;
		throw err;
	}

	async exec(query, {
		context,
		cache: {key: cacheKey, ttl = ONE_DAY} = {},
		variables = {},
		requestOptions = {},
	} = {}) {
		if (cacheKey && this._cache) {
			const cached = await this._cache.get(cacheKey);
			if (cached !== undefined) return cached;
		}

		if (!/^\s*query|mutation|subscription/.test(query) && /^\s*[a-zA-Z0-9]/.test(query)) {
			query = `query { ${query} }`;
		}

		const result = this._api ?
			await this._execApi(query, {variables, requestOptions}) :
			await this._execGraphql(query, {context, variables});

		if (cacheKey && this._cache) await this._cache.set(cacheKey, result, {ttl});
		return result;
	}

	async getAll(query, ...args) {
		return this.exec(query, ...args);
	}

	async get(query, ...args) {
		const result = await this.exec(query, ...args);
		if (!result) return result;

		const keys = Object.keys(result);
		if (keys.length !== 1) return result;

		const newResult = result[keys[0]];
		if (newResult && 'nodes' in newResult && Object.keys(newResult).length === 1) {
			return newResult.nodes;
		}
		return newResult;
	}

	static enum(val) {
		return new GqlEnum(val);
	}

	enum(val) {
		return this.constructor.enum(val);
	}

	get enums() {
		return this._enums;
	}

	fragment(name) {
		if (!this._fragments) throw new Error('Invalid Method: Fragments not defined');
		if (this._fragments[name] === undefined) throw new Error(`[schema:${this._schemaName}] Invalid fragment name, ${name}`);

		return this._fragments[name];
	}

	get fragments() {
		return this._fragments;
	}

	static toGqlArg = toGqlArg;

	toGqlArg = toGqlArg;

	arg(arg, opts = {}) {
		let pick;
		if (_.isArray(opts)) pick = opts;
		else ({pick} = opts);

		return this.toGqlArg(arg, {roundBrackets: true, pick});
	}

	static tag(strings, ...args) {
		let out = strings[0];
		const fragments = {};
		for (let i = 1; i < strings.length; i++) {
			const arg = args[i - 1];
			if (/(?::|\()\s*$/.test(strings[i - 1])) {
				// arg is a graphql argument
				out += this.toGqlArg(arg);
			}
			else if (arg) {
				// arg is a graphql field
				if (typeof arg === 'string') {
					out += arg;
				}
				else if (arg instanceof GqlFragment) {
					out += arg.toString();
					if (fragments[arg.getName()] === undefined) {
						fragments[arg.getName()] = arg.getDefinition();
					}
				}
				else if (Array.isArray(arg)) {
					out += arg.filter(Boolean).join(' ');
				}
			}

			out += strings[i];
		}
		if (_.isEmpty(fragments)) return out;

		out += `\n${Object.values(fragments).join('\n')}`;
		return out;
	}

	tag(...args) {
		return this.constructor.tag(...args);
	}
}

export default Gql;

export {
	Gql,
	ApiError,
	GraphqlError,
};
