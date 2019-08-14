import getFieldNames from 'graphql-list-fields';
import Gql from './Gql';
import GqlApi, {GqlApiError} from './GqlApi';
import GqlSchema, {GqlSchemaError} from './GqlSchema';
import defaultPostRequest from './postRequestNode';

// Set default Connect client for API requests.
// NOTE: Not done in class so it can also be imported in frontend clients with own impelentation
GqlApi.postRequest = defaultPostRequest;

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

export default Gql;
