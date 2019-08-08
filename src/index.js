import {isEmpty} from 'lodash';
import getFieldNames from 'graphql-list-fields';
import Gql from './Gql';
import GqlApi, {GqlApiError} from './GqlApi';
import GqlSchema, {GqlSchemaError} from './GqlSchema';

async function postRequest(url, {headers, cookies, body, token} = {}) {
	// eslint-disable-next-line global-require
	const response = require('sm-utils').Connect
		.url(url)
		.headers(headers)
		.cookies(cookies)
		.body(body)
		.post();
	if (token) response.apiToken(token);

	let result;
	try { result = JSON.parse(response.body) }
	catch (e) { result = null }

	if (response.statusCode !== 200) {
		const err = new GqlApiError(`${response.statusCode}, Invalid status code`);
		err.errors = result && result.errors;
		err.body = response.body;
		err.statusCode = response.statusCode;
		throw err;
	}

	if (!result) {
		const err = new GqlApiError('Invalid result from api');
		err.body = response.body;
		throw err;
	}

	if (!isEmpty(result.errors)) {
		const err = new GqlApiError('Errors in api response');
		err.errors = result.errors;
		throw err;
	}

	return result.data;
}

// Set default Connect client for API requests.
// NOTE: Not done in class so it can also be imported in frontend clients with own impelentation
GqlApi.postRequest = postRequest.bind(GqlApi);

Gql.fromApi = opts => new GqlApi(opts);

// Moved these functions here so that schema related files do not get imported in Api only build
Gql.fromConfig = opts => new GqlSchema({config: opts, cache: opts.cache});
Gql.fromSchemas = opts => new GqlSchema({schemas: opts, cache: opts.cache});


export * from './helpers';
export * from './connection';
export * from './Schema';
export * from './makeSchemaFrom';
export * from './generateTypes';

export {
	Gql,
	GqlApiError,
	GqlSchemaError,
	getFieldNames,
};
