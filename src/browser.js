/* eslint-env browser */
import Gql from './Gql.js';
import GqlApi, {GqlApiError} from './GqlApi.js';

export * from './helpers.js';

Gql.fromApi = opts => new GqlApi(opts);

export {
	Gql,
	GqlApi,
	GqlApiError,
};

export default Gql;
