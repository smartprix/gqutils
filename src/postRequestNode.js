import {isEmpty} from 'lodash';
import {Connect} from 'sm-utils';
import {GqlApiError} from './GqlApi';

/** Default post request method to be used for `GqlApi` */
async function defaultPostRequest(url, {headers, cookies, body, token} = {}) {
	const response = Connect
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

export default defaultPostRequest;
