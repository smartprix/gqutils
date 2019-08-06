import isEmpty from 'lodash/isEmpty';

import {
	toGqlArg,
	GqlEnum,
	GqlFragment,
	parseFragmentFields,
} from './helpers';

const ONE_DAY = 24 * 3600 * 1000;

class GqlApiError extends Error {}
class GqlSchemaError extends Error {}

class Gql {
	constructor(opts = {}) {
		if (new.target === Gql) throw new Error('Cannot instantiate abstract class Gql');
		if (typeof this._getQueryResult !== 'function') {
			throw new Error(`Method ${this.constructor.name}._getQueryResult() must be implemented`);
		}

		this._cache = opts.cache;
	}

	static fromApi(opts) {
		// eslint-disable-next-line global-require
		const GqlApi = require('./GqlApi').default;
		return new GqlApi(opts);
	}

	static fromConfig(opts) {
		// eslint-disable-next-line global-require
		const GqlSchema = require('./GqlSchema').default;
		return new GqlSchema({config: opts, cache: opts.cache});
	}

	static fromSchemas(opts) {
		// eslint-disable-next-line global-require
		const GqlSchema = require('./GqlSchema').default;
		return new GqlSchema({schemas: opts, cache: opts.cache});
	}

	static enum(name, val) {
		return new GqlEnum(name, val);
	}

	static fragment(schema) {
		return new GqlFragment({
			name: schema.name,
			type: schema.type,
			fields: parseFragmentFields(schema.fields),
		});
	}

	static toGqlArg = toGqlArg;

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
		if (isEmpty(fragments)) return out;

		out += `\n${Object.values(fragments).join('\n')}`;
		return out;
	}

	async exec(query, {
		context,
		cache: {key: cacheKey, ttl = ONE_DAY, forceUpdate = false} = {},
		variables = {},
		requestOptions = {},
	} = {}) {
		if (cacheKey && this._cache && !forceUpdate) {
			const cached = await this._cache.get(cacheKey);
			if (cached !== undefined) return cached;
		}

		if (!/^\s*query|mutation|subscription/.test(query) && /^\s*[a-zA-Z0-9]/.test(query)) {
			query = `query { ${query} }`;
		}

		const result = await this._getQueryResult(query, {context, variables, requestOptions});

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

	enum(name) {
		if (!this._enums) throw new Error('Invalid Method: Enums not defined');
		if (this._enums[name] === undefined) throw new Error(`[schema:${this._schemaName || ''}] Invalid enum name, ${name}`);

		return this._enums[name];
	}

	get enums() {
		return this._enums;
	}

	fragment(name) {
		if (!this._fragments) throw new Error('Invalid Method: Fragments not defined');
		if (this._fragments[name] === undefined) throw new Error(`[schema:${this._schemaName || ''}] Invalid fragment name, ${name}`);

		return this._fragments[name];
	}

	get fragments() {
		return this._fragments;
	}

	toGqlArg = toGqlArg;

	arg(arg, opts = {}) {
		let pick;
		if (Array.isArray(opts)) pick = opts;
		else ({pick} = opts);

		return this.toGqlArg(arg, {roundBrackets: true, pick});
	}

	tag(...args) {
		return this.constructor.tag(...args);
	}
}

export default Gql;
export {
	Gql,
	GqlApiError,
	GqlSchemaError,
};
