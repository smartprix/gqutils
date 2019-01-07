import path from 'path';
import _ from 'lodash';
import {PubSub} from 'graphql-subscriptions';
import {generateTypeScriptTypes} from 'graphql-schema-typescript';
import {makeSchemas} from './Schema';

async function makeSchemaFromModules(modules, opts = {}) {
	const schemas = [];
	const resolvers = {};

	modules.forEach((folder) => {
		let mod;
		if (typeof folder === 'string') {
			folder = path.resolve(opts.baseFolder || '', folder);
			mod = require(folder);
		}
		else {
			mod = folder;
		}

		if (mod.schema) schemas.push(mod.schema);
		if (mod.resolvers) _.merge(resolvers, mod.resolvers);
	});

	const logger = {
		log(e) {
			console.log(e);
		},
	};

	const defaultSchemaName = opts.defaultSchemaName || 'default';

	const graphqlSchemas = makeSchemas(schemas, resolvers, {
		schema: opts.schema || opts.schemas || [],
		defaultSchemaName,
		logger: opts.logger || logger,
		allowUndefinedInResolve: opts.allowUndefinedInResolve || false,
		resolverValidationOptions: opts.resolverValidationOptions || {},
	});

	const pubsub = new PubSub();

	pubsub.out = function (key, message) {
		pubsub.publish('output', {key, message});
	};

	if (opts.generateTypes) {
		const folder = opts.outputPath || `${process.cwd()}/typings/graphql`;
		await Promise.all(Object.keys(graphqlSchemas).map(async (schemaName) => {
			await generateTypeScriptTypes(
				graphqlSchemas[schemaName],
				path.join(folder, `${schemaName}.d.ts`),
				{
					global: true,
					tabSpaces: 4,
					namespace: `GraphQl.${schemaName}`,
					contextType: opts.contextType || 'Routes.context',
					// asyncResult: true
				},
			);
		}));
	}

	return {
		schemas: graphqlSchemas,
		schema: graphqlSchemas,
		defaultSchema: graphqlSchemas[defaultSchemaName],
		pubsub,
	};
}

export * from './errors';
export * from './connection';
export * from './Schema';
export {makeSchemaFromModules};
