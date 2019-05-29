import _ from 'lodash';
import {parse, validate, execute} from 'graphql';

import {formatError} from './errors';
import {makeSchemaFromConfig} from './makeSchemaFrom';

const ONE_DAY = 24 * 3600 * 1000;
const ENUM_PREFIX = '__ENUM__::';
// const VAR_PREFIX = '__VAR__::';

// const NO_QUOTES_REGEX = new RegExp(`^(${ENUM_PREFIX}|${VAR_PREFIX})([A-Za-z_]+)$`);
const ENUM_REGEX = new RegExp(`^${ENUM_PREFIX}([A-Za-z_]+)$`);

/**
 * we are not using the inbuilt graphql function because it validates
 * the graphql, which is an expensive operation
 * return graphql(schema, query, rootValue, contextValue, variableValues);
 * taken from:
 * @see https://github.com/graphql/graphql-js/blob/master/src/graphql.js
 */
function graphql(schemaObj, query, rootValue, contextValue, variableValues) {
	// parse
	let document;
	try {
		document = parse(query);
	}
	catch (syntaxError) {
		return Promise.resolve({errors: [syntaxError]});
	}

	// validate only in developement
	if (process.env.NODE_ENV !== 'production') {
		const validationErrors = validate(schemaObj, document);
		if (validationErrors.length > 0) {
			return Promise.resolve({errors: validationErrors});
		}
	}

	return execute(
		schemaObj,
		document,
		rootValue,
		contextValue,
		variableValues,
	);
}

function convertObjToGqlArg(obj) {
	const gqlArg = [];
	_.forEach(obj, (value, key) => {
		// eslint-disable-next-line no-use-before-define
		gqlArg.push(`${key}: ${convertToGqlArg(value)}`);
	});
	return `${gqlArg.join(', ')}`;
}

function convertStrToGqlArg(str) {
	const [, val] = str.match(ENUM_REGEX) || [];
	if (val) return val;
	// const [, prefix, val] = str.match(NO_QUOTES_REGEX) || [];
	// if (prefix && val) return prefix === VAR_PREFIX ? '$' + val : val;

	return JSON.stringify(str);
}

function convertToGqlArg(value) {
	if (value == null) return null;

	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return convertStrToGqlArg(value);
	if (_.isPlainObject(value)) return `{${convertObjToGqlArg(value)}}`;

	return JSON.stringify(value);
}

class Gql {
	constructor(opts = {}) {
		const {schema, pubsub, defaultSchema} = makeSchemaFromConfig(opts);

		this.schema = schema;
		this.defaultSchema = defaultSchema;
		this.pubsub = pubsub;

		this.logger = opts.logger || console;
		this.cache = opts.cache;
		this.formatError = opts.formatError || formatError;
	}

	async exec(query, context, {
		cache: {key: cacheKey, ttl = ONE_DAY} = {},
		variables = {},
		schemaName,
	} = {}) {
		const schema = schemaName ? this.schema[schemaName] : this.defaultSchema;

		if (cacheKey && this.cache) {
			const cached = await this.cache.get(cacheKey);
			if (cached) return cached;
		}

		if (!/^\s*query|mutation|subscription/.test(query) && /^\s*[a-zA-Z0-9]/.test(query)) {
			query = `query { ${query} }`;
		}

		const result = await graphql(schema, query, null, context, variables);

		if (!result.errors) {
			if (cacheKey && this.cache) await this.cache.set(cacheKey, result.data, {ttl});
			return result.data;
		}


		let fields = {};
		const errors = result.errors;

		errors.forEach((error) => {
			error = this.formatError(error);
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

		const err = new Error('Error in graphQL api');
		err.errors = errors;
		err.fields = fields;
		throw err;
	}

	async getAll(query, context, opts) {
		return this.exec(query, context, opts);
	}

	async get(query, context, opts) {
		const result = await this.exec(query, context, opts);
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
		return val ? ENUM_PREFIX + val : val;
	}

	enum(val) {
		return this.constructor.enum(val);
	}

	// NOTE: Not useful for now
	// static var(val) {
	// 	return val ? VAR_PREFIX + val : val;
	// }

	// var(val) {
	// 	return this.constructor.var(val);
	// }

	static toGqlArg(arg, opts = {}) {
		let gqlArg = '';
		if (_.isPlainObject(arg)) {
			if (Array.isArray(opts)) opts = {pick: opts};
			if (opts.pick) arg = _.pick(arg, opts.pick);

			gqlArg = convertObjToGqlArg(arg);

			if (opts.curlyBrackets) gqlArg = `{${gqlArg}}`;
		}
		else {
			gqlArg = convertToGqlArg(arg);
		}

		if (opts.roundBrackets) gqlArg = gqlArg ? `(${gqlArg})` : ' ';

		return gqlArg || '# no args <>\n';
	}

	static tag(strings, ...args) {
		let out = strings[0];
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
				else if (Array.isArray(arg)) {
					out += arg.filter(Boolean).join(' ');
				}
			}

			out += strings[i];
		}
		return out;
	}

	tag(...args) {
		return this.constructor.tag(...args);
	}
}

export default Gql;
