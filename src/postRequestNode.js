import {Connect} from 'sm-utils';
import {GqlApiError} from './GqlApi';

/** Default post request method to be used for `GqlApi` */
async function defaultPostRequest(url, {headers, cookies, body, token} = {}) {
	const request = Connect
		.url(url)
		.headers(headers)
		.cookies(cookies)
		.body(body)
		.keepalive()
		.timeoutMs(15000);
	if (token) request.apiToken(token);

	let response;
	try {
		response = await request.post();
	}
	catch (e) {
		e.err_code = 'FETCH_ERROR';
		e.statusCode = 600;
		throw e;
	}

	let result;
	try {
		result = JSON.parse(response.body);
	}
	catch (e) {
		result = null;
	}

	if (response.statusCode !== 200) {
		const err = new GqlApiError(`${response.statusCode}, Invalid status code`);
		err.errors = result && result.errors;
		err.body = response.body;
		err.statusCode = response.statusCode;
		throw err;
	}
	if (!result) {
		const err = new GqlApiError('Malformed json response');
		err.body = response.body;
		throw err;
	}
	if (result.errors && result.errors.length) {
		const err = new GqlApiError('Errors in api response');
		err.errors = result.errors;
		throw err;
	}

	return result.data;
}

export default defaultPostRequest;
