import isEmpty from 'lodash/isEmpty';
import {parse as graphqlParse, validate, execute} from 'graphql';
import Gql from './Gql';
import {formatError} from './helpers';
import {makeSchemaFromConfig} from './makeSchemaFrom';

class GqlSchemaError extends Error {}

class GqlSchema extends Gql {
	constructor(opts = {}) {
		super(opts);

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

	getSchemas() {
		return this._makeResult.schemas;
	}

	getData() {
		return this._makeResult.data;
	}

	getPubSub() {
		return this._makeResult.pubsub;
	}

	_formatAndThrowErrors(errors, context) {
		let fields = {};

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

		const err = new GqlSchemaError(`[schema:${this._schemaName}] Error in graphQL api`);
		err.errors = errors;
		err.fields = fields;
		throw err;
	}

	/**
	 * Pre parse queries that don;t have any static data and use variables
	 * @param {string} query
	 * @param {any} [context]
	 */
	parse(query, {context, validate: validateGraphql = this._validateGraphql} = {}) {
		let document;
		try {
			document = graphqlParse(query);
		}
		catch (syntaxError) {
			return this._formatAndThrowErrors([syntaxError], context);
		}

		if (validateGraphql) {
			const validationErrors = validate(this._schema, document);
			if (validationErrors.length > 0) {
				return this._formatAndThrowErrors(validationErrors, context);
			}
		}
		return document;
	}

	async execParsed(document, {context, variables}) {
		const result = await execute(
			this._schema,
			document,
			null,
			context,
			variables,
		);

		if (isEmpty(result.errors)) return result.data;

		return this._formatAndThrowErrors(result.errors, context);
	}

	/**
	 * we are not using the inbuilt graphql function because it validates
	 * the graphql query, which is an expensive operation
	 * taken from:
	 * @see https://github.com/graphql/graphql-js/blob/master/src/graphql.js
	 */
	async _getQueryResult(query, opts = {}) {
		const {context} = opts;
		const document = this.parse(query, context);
		return this.execParsed(document, opts);
	}
}

export default GqlSchema;
export {GqlSchemaError};
