/* eslint-env browser */
import Gql from './Gql';
import GqlApi, {GqlApiError} from './GqlApi';

export * from './helpers';

Gql.fromApi = opts => new GqlApi(opts);

export {
	Gql,
	GqlApi,
	GqlApiError,
};

export default Gql;
