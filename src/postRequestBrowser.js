/* eslint-env browser */
import {GqlApiError} from './GqlApi';

/**
 * Default post request method to be used for `GqlApi` in browsers
 * @param {string} url
 * @param {{headers: object, body: object, token?: string}} [opts]
 */
async function defaultPostRequest(url, {headers, body, token}) {
	if (token) {
		headers['x-api-token'] = token;
	}

	const response = await fetch(url, {
		method: 'POST',
		cache: 'no-cache',
		credentials: 'include',
		headers,
		body: JSON.stringify(body),
	});

	const responseBody = await response.text();

	let result;
	try { result = JSON.parse(responseBody) }
	catch (e) { result = null }

	if (response.status !== 200) {
		const err = new GqlApiError(`${response.status}, Invalid status code`);
		err.errors = result && result.errors;
		err.body = responseBody;
		err.statusCode = response.status;
		throw err;
	}

	if (!result) {
		const err = new GqlApiError('Invalid result from api');
		err.body = responseBody;
		throw err;
	}

	if (Object.keys(result.errors || {}).length) {
		const err = new GqlApiError('Errors in api response');
		err.errors = result.errors;
		throw err;
	}

	return result.data;
}

export default defaultPostRequest;
