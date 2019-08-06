import isEmpty from 'lodash/isEmpty';

import {Gql, GqlApiError} from './Gql';

class GqlApi extends Gql {
	constructor(api = {}) {
		if (!api.endpoint) throw new GqlApiError('Api endpoint is not provided');

		super(api);

		this._api = Object.assign({
			headers: {},
			cookies: {},
		}, api);
		this._fragments = api.fragments;
		this._enums = api.enums;
	}

	/** override this method to use your own http client */
	static async postRequest(url, {headers, cookies, body, token} = {}) {
		// eslint-disable-next-line global-require
		const response = require('sm-utils').Connect
			.url(url)
			.headers(headers)
			.cookies(cookies)
			.body(body)
			.post();
		if (token) response.apiToken(token);
		return response;
	}

	async _getQueryResult(query, {variables, requestOptions} = {}) {
		const headers = Object.assign({}, this._api.headers, requestOptions.headers);
		const cookies = Object.assign({}, this._api.cookies, requestOptions.cookies);
		const response = await this.constructor.postRequest(this._api.endpoint, {
			headers,
			cookies,
			body: {query, variables},
			token: this._api.token,
		});

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
}

export default GqlApi;
