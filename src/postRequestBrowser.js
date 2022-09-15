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
	if (!headers['Content-Type']) {
		headers['Content-Type'] = 'application/json';
	}
	if (!headers['x-requested-with']) {
		headers['x-requested-with'] = 'fetch';
	}

	let response;
	try {
		response = await fetch(url, {
			method: 'POST',
			cache: 'no-cache',
			credentials: 'include',
			headers,
			body: JSON.stringify(body),
		});
	}
	catch (e) {
		e.err_code = 'FETCH_ERROR';
		e.statusCode = 600;
		throw e;
	}

	let result;
	try {
		result = await response.json();
	}
	catch (e) {
		result = null;
	}

	if (response.status !== 200) {
		const err = new GqlApiError(`${response.status}, Invalid status code`);
		err.errors = result && result.errors;
		err.body = await response.text();
		err.statusCode = response.status;
		throw err;
	}

	if (!result) {
		const err = new GqlApiError('Malformed json response');
		err.body = await response.text();
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
