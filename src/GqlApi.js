import Gql, {GqlApiError} from './Gql';

class GqlApi extends Gql {
	constructor(api = {}) {
		if (!api.endpoint) throw new GqlApiError('Api endpoint is not provided');

		super(api);
		if (typeof this.constructor.postRequest !== 'function') {
			throw new GqlApiError(`Method ${this.constructor.name}.postRequest() must be implemented`);
		}

		this._api = Object.assign({
			headers: {},
			cookies: {},
		}, api);
		this._fragments = api.fragments;
		this._enums = api.enums;
	}

	async _getQueryResult(query, {variables, requestOptions} = {}) {
		const {headers, cookies, ...other} = requestOptions;

		return this.constructor.postRequest(this._api.endpoint, {
			headers: Object.assign({}, this._api.headers, headers),
			cookies: Object.assign({}, this._api.cookies, cookies),
			body: {query, variables},
			token: this._api.token,
			...other,
		});
	}
}

export default GqlApi;
