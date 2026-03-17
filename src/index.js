import getFieldNames from 'graphql-list-fields';
import Gql from './Gql.js';
import GqlApi, {GqlApiError} from './GqlApi.js';
import GqlSchema, {GqlSchemaError} from './GqlSchema.js';
import defaultPostRequest from './postRequestBrowser.js';

// Set default Connect client for API requests.
// NOTE: Not done in class so it can also be imported in frontend clients with own impelentation
GqlApi.postRequest = defaultPostRequest;

Gql.fromApi = opts => new GqlApi(opts);

// Moved these functions here so that schema related files do not get imported in Api only build
Gql.fromConfig = opts => new GqlSchema({config: opts, cache: opts.cache});
Gql.fromSchemas = opts => new GqlSchema({schemas: opts, cache: opts.cache});


export * from './helpers.js';
export * from './connection.js';
export * from './Schema.js';
export * from './makeSchemaFrom.js';
export * from './generateTypes.js';

export {
	Gql,
	GqlApiError,
	GqlSchemaError,
	getFieldNames,
};

export default Gql;
